import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { randomUUID, randomBytes, createHash, createHmac } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { Server } from "socket.io";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createStore } from "./store.js";
import { seed } from "./seed.js";
import {
  fail,
  membership,
  permission,
  roomAccess,
  isBlocked,
  publicProfile,
  safeFilename,
} from "./policy.js";

export async function createApp(options = {}) {
  const production = process.env.NODE_ENV === "production";
  const origin = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || "http://localhost:5173";
  if (
    production &&
    (!process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY ||
      !process.env.SUPABASE_ANON_KEY)
  )
    throw Error("Production requires Supabase configuration.");
  const db = createStore({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    directory: options.directory || "data",
  });
  await db.init();
  if (!db.supabase && !options.noSeed) await seed(db);
  const app = express(),
    http = createServer(app);
  app.set("trust proxy", Number(process.env.TRUST_PROXY || 0));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          mediaSrc: ["'self'", "blob:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          fontSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(cors({ origin, credentials: true }));
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== origin
    )
      return res.status(403).json({ error: "Request origin is not allowed." });
    next();
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const id = () => randomUUID(),
    now = () => new Date().toISOString(),
    hash = (s) => createHash("sha256").update(s).digest("hex");
  const cookies = {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/api",
    maxAge: 7 * 86400000,
  };
  // Socket.IO shares the root-scoped opaque session; no service key or password leaves the server.
  cookies.path = "/";
  async function session(res, userId) {
    const token = randomBytes(32).toString("hex");
    await db.insert("sessions", {
      id: hash(token),
      user_id: userId,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    res.cookie("nexora_session", token, cookies);
  }
  async function identify(token) {
    if (!token) return null;
    const s = await db.get("sessions", hash(token));
    return s && Date.parse(s.expires_at) > Date.now()
      ? await db.get("profiles", s.user_id)
      : null;
  }
  const auth = async (req, res, next) => {
    try {
      req.user = await identify(req.cookies.nexora_session);
      if (!req.user) fail(401, "Please sign in to continue.");
      next();
    } catch (e) {
      next(e);
    }
  };
  const admin = async (req, res, next) => {
    if (!(process.env.ADMIN_USER_IDS || "").split(",").includes(req.user.id))
      return res
        .status(403)
        .json({ error: "Platform administrator access required." });
    next();
  };
  const io = new Server(http, {
    cors: { origin, credentials: true },
    maxHttpBufferSize: 64000,
    allowRequest: (req, cb) => cb(null, req.headers.origin === origin),
  });
  const publish = async (room, event, data) => {
    for (const s of await io.in(room).fetchSockets()) {
      if (data?.user_id && (await isBlocked(db, s.data.user.id, data.user_id)))
        continue;
      s.emit(event, data);
    }
  };
  const safe = publicProfile;
  async function ensureProfile(user, username) {
    let p = await db.get("profiles", user.id);
    if (p) return p;
    let base = (
      username ||
      user.user_metadata?.username ||
      user.email?.split("@")[0] ||
      "explorer"
    )
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20);
    if (base.length < 3) base = "explorer";
    if ((await db.list("profiles", { username: base })).length)
      base += "_" + randomBytes(3).toString("hex");
    p = {
      id: user.id,
      username: base,
      display_name: user.user_metadata?.full_name || base,
      bio: "",
      color: "violet",
      status: "online",
      avatar_url: "",
      activity: "",
      allow_dms: true,
      created_at: now(),
    };
    await db.insert("profiles", p);
    return p;
  }
  app.get("/api/health", (_, res) =>
    res.json({ ok: true, mode: db.supabase ? "supabase" : "local" }),
  );
  app.get("/api/config", (_, res) =>
    res.json({
      mode: db.supabase ? "supabase" : "local",
      google: !!db.supabase,
      maxUploadMB: 10,
    }),
  );
  const credentials = z.object({
    email: z.email().max(254),
    password: z.string().min(10).max(128),
    username: z
      .string()
      .regex(/^[a-z0-9_]{3,24}$/)
      .optional(),
  });
  app.post("/api/auth/register", authLimit, async (req, res) => {
    const v = credentials.parse(req.body);
    if ((await db.list("profiles", { username: v.username || "" })).length)
      fail(409, "That username is already taken.");
    if (db.supabase) {
      const client = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { auth: { persistSession: false } },
      );
      const { data, error } = await client.auth.signUp({
        email: v.email,
        password: v.password,
        options: { data: { username: v.username }, emailRedirectTo: origin },
      });
      if (error) fail(400, error.message);
      if (data.user && data.user.identities?.length !== 0)
        await ensureProfile(data.user, v.username);
      return res.json({ registered: true, confirmation: !data.session });
    }
    if ((await db.list("profiles", { email: v.email.toLowerCase() })).length)
      fail(409, "An account already uses this email.");
    const uid = id();
    const p = await ensureProfile({ id: uid, email: v.email }, v.username);
    await db.update("profiles", uid, {
      email: v.email.toLowerCase(),
      password_hash: await bcrypt.hash(v.password, 12),
    });
    res.json({ registered: true, confirmation: false });
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const v = z
      .object({ email: z.email(), password: z.string().min(1).max(128) })
      .parse(req.body);
    let p;
    if (db.supabase) {
      const client = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { auth: { persistSession: false } },
      );
      const { data, error } = await client.auth.signInWithPassword(v);
      if (error) fail(401, "Email or password is incorrect.");
      p = await ensureProfile(data.user);
    } else {
      p = (await db.list("profiles", { email: v.email.toLowerCase() }))[0];
      if (
        !p?.password_hash ||
        !(await bcrypt.compare(v.password, p.password_hash))
      )
        fail(401, "Email or password is incorrect.");
    }
    await session(res, p.id);
    res.json({ user: safe(p) });
  });
  function oauthClient(req, res) {
    const jar = { ...req.cookies };
    return createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        auth: {
          flowType: "pkce",
          storageKey: "nexora-oauth",
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: true,
          storage: {
            getItem: (key) => jar[key] || null,
            setItem: (key, value) => {
              jar[key] = value;
              if (key.includes("code-verifier"))
                res.cookie(key, value, { ...cookies, maxAge: 600000 });
            },
            removeItem: (key) => {
              delete jar[key];
              res.clearCookie(key, { ...cookies, maxAge: undefined });
            },
          },
        },
      },
    );
  }
  app.get("/api/auth/google", authLimit, async (req, res) => {
    if (!db.supabase) fail(503, "Configure Supabase and Google OAuth first.");
    const client = oauthClient(req, res);
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          (process.env.SERVER_ORIGIN || origin) + "/api/auth/callback",
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url)
      fail(400, error?.message || "Unable to start Google sign-in.");
    res.redirect(data.url);
  });
  app.get("/api/auth/callback", authLimit, async (req, res) => {
    if (!db.supabase) fail(503, "OAuth is not configured.");
    if (typeof req.query.code !== "string")
      return res.redirect(
        origin + "/?auth_error=Google%20sign-in%20was%20cancelled.",
      );
    const { data, error } = await oauthClient(
      req,
      res,
    ).auth.exchangeCodeForSession(req.query.code);
    if (error || !data.user)
      return res.redirect(
        origin + "/?auth_error=Sign-in%20expired.%20Please%20try%20again.",
      );
    const p = await ensureProfile(data.user);
    await session(res, p.id);
    res.redirect(origin);
  });
  app.post("/api/auth/logout", auth, async (req, res) => {
    await db.remove("sessions", hash(req.cookies.nexora_session));
    for (const s of await io.in("user:" + req.user.id).fetchSockets())
      if (s.data.sessionHash === hash(req.cookies.nexora_session))
        s.disconnect(true);
    res.clearCookie("nexora_session", { ...cookies, maxAge: undefined });
    res.json({ ok: true });
  });
  app.get("/api/auth/me", auth, (req, res) =>
    res.json({
      user: safe(req.user),
      admin: (process.env.ADMIN_USER_IDS || "")
        .split(",")
        .includes(req.user.id),
    }),
  );
  app.patch("/api/profile", auth, async (req, res) => {
    const v = z
      .object({
        display_name: z.string().min(1).max(40),
        bio: z.string().max(200),
        status: z.enum(["online", "idle", "dnd", "offline"]),
        activity: z.string().max(60),
        allow_dms: z.boolean(),
        color: z.enum(["violet", "blue", "pink", "green", "orange", "teal"]),
        avatar_url: z.union([
          z.literal(""),
          z.url().refine((s) => s.startsWith("https://")),
        ]),
      })
      .partial()
      .parse(req.body);
    const p = await db.update("profiles", req.user.id, v);
    io.emit("profile", safe(p));
    res.json(safe(p));
  });
  app.get("/api/bootstrap", auth, async (req, res) => {
    const memberships = await db.list("members", { user_id: req.user.id }),
      cs = await db.list("communities");
    const communities = cs.filter((c) =>
      memberships.some((m) => m.community_id === c.id),
    );
    const channels = (await db.list("channels")).filter((c) =>
      communities.some((s) => s.id === c.community_id),
    );
    const cms = await db.list("conversation_members", { user_id: req.user.id });
    const conversations = (await db.list("conversations")).filter((c) =>
      cms.some((m) => m.conversation_id === c.id),
    );
    res.json({
      communities,
      channels,
      conversations,
      notifications: await db.list("notifications", { user_id: req.user.id }),
    });
  });
  app.get("/api/discover", async (req, res) => {
    const members = await db.list("members");
    res.json(
      (await db.list("communities", { is_public: true })).map((c) => ({
        ...c,
        member_count: members.filter((m) => m.community_id === c.id).length,
      })),
    );
  });
  app.post("/api/communities", auth, async (req, res) => {
    const v = z
      .object({
        name: z.string().min(2).max(48),
        description: z
          .string()
          .max(180)
          .default("A new space for your people."),
        is_public: z.boolean().default(false),
        category: z
          .enum(["Community", "Gaming", "Design", "Technology", "Music"])
          .default("Community"),
      })
      .parse(req.body);
    const c = await db.insert("communities", {
      id: id(),
      ...v,
      owner_id: req.user.id,
      icon: "sparkles",
      color: "violet",
      created_at: now(),
    });
    await db.insert("members", {
      id: id(),
      community_id: c.id,
      user_id: req.user.id,
      role_id: null,
      joined_at: now(),
    });
    for (const [name, kind] of [
      ["general", "text"],
      ["The Lounge", "voice"],
    ])
      await db.insert("channels", {
        id: id(),
        community_id: c.id,
        name,
        kind,
        description: "Make yourself at home.",
        created_at: now(),
      });
    res.status(201).json(c);
  });
  async function join(uid, cid) {
    if ((await db.list("bans", { community_id: cid, user_id: uid })).length)
      fail(403, "You are banned from this community.");
    if (!(await db.list("members", { community_id: cid, user_id: uid })).length)
      await db.insert("members", {
        id: id(),
        community_id: cid,
        user_id: uid,
        role_id: null,
        joined_at: now(),
      });
  }
  app.post("/api/communities/:id/join", auth, async (req, res) => {
    const c = await db.get("communities", req.params.id);
    if (!c?.is_public) fail(404, "Public community not found.");
    await join(req.user.id, c.id);
    res.json({ ok: true });
  });
  app.post("/api/communities/:id/channels", auth, async (req, res) => {
    await permission(db, req.user.id, req.params.id, "manage_channels");
    const v = z
      .object({
        name: z.string().min(1).max(40),
        kind: z.enum(["text", "voice", "announcement"]),
        description: z.string().max(150).default(""),
      })
      .parse(req.body);
    const c = await db.insert("channels", {
      id: id(),
      community_id: req.params.id,
      ...v,
      created_at: now(),
    });
    publish("community:" + req.params.id, "refresh", {});
    res.status(201).json(c);
  });
  app.get("/api/communities/:id/members", auth, async (req, res) => {
    await membership(db, req.user.id, req.params.id);
    const ms = await db.list("members", { community_id: req.params.id });
    res.json(
      await Promise.all(
        ms.map(async (m) => ({
          ...m,
          profile: safe(await db.get("profiles", m.user_id)),
        })),
      ),
    );
  });
  app.get("/api/communities/:id/roles", auth, async (req, res) => {
    await membership(db, req.user.id, req.params.id);
    res.json(await db.list("roles", { community_id: req.params.id }));
  });
  app.post("/api/communities/:id/roles", auth, async (req, res) => {
    const c = await db.get("communities", req.params.id);
    if (c?.owner_id !== req.user.id)
      fail(403, "Only the owner can manage roles.");
    const v = z
      .object({
        name: z.string().min(1).max(24),
        permissions: z
          .array(
            z.enum(["manage_channels", "moderate_messages", "manage_members"]),
          )
          .max(3),
      })
      .parse(req.body);
    res.json(await db.insert("roles", { id: id(), community_id: c.id, ...v }));
  });
  app.patch("/api/communities/:id/members/:uid", auth, async (req, res) => {
    const c = await db.get("communities", req.params.id);
    if (c?.owner_id !== req.user.id)
      fail(403, "Only the owner can assign roles.");
    const { role_id } = z
      .object({ role_id: z.uuid().nullable() })
      .parse(req.body);
    const role = role_id ? await db.get("roles", role_id) : null;
    if (role_id && role?.community_id !== c.id) fail(400, "Invalid role.");
    const m = await membership(db, req.params.uid, c.id);
    res.json(await db.update("members", m.id, { role_id }));
  });
  app.delete("/api/communities/:id/members/:uid", auth, async (req, res) => {
    await permission(db, req.user.id, req.params.id, "manage_members");
    const c = await db.get("communities", req.params.id);
    if (c.owner_id === req.params.uid)
      fail(403, "The owner cannot be removed.");
    const m = await membership(db, req.params.uid, c.id);
    await db.remove("members", m.id);
    if (req.query.ban === "true")
      await db.insert("bans", {
        id: id(),
        community_id: c.id,
        user_id: req.params.uid,
        created_at: now(),
      });
    for (const s of await io.in("user:" + req.params.uid).fetchSockets()) {
      for (const ch of await db.list("channels", { community_id: c.id }))
        s.leave(ch.id);
      s.leave("community:" + c.id);
      s.disconnect(true);
    }
    res.json({ ok: true });
  });
  app.post("/api/communities/:id/invites", auth, async (req, res) => {
    await membership(db, req.user.id, req.params.id);
    const invite = await db.insert("invites", {
      id: randomBytes(18).toString("base64url"),
      community_id: req.params.id,
      creator_id: req.user.id,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    res.json({ url: origin + "/?invite=" + invite.id });
  });
  app.post("/api/invites/:code", auth, async (req, res) => {
    const i = await db.get("invites", req.params.code);
    if (!i || Date.parse(i.expires_at) < Date.now())
      fail(404, "This invite has expired.");
    await join(req.user.id, i.community_id);
    res.json({ community_id: i.community_id });
  });
  async function hydrate(m) {
    const reactions = await db.list("reactions", { message_id: m.id });
    const attachment = m.attachment_id
      ? await db.get("attachments", m.attachment_id)
      : null;
    return {
      ...m,
      profile: safe(await db.get("profiles", m.user_id)),
      reactions,
      attachment,
    };
  }
  app.get("/api/rooms/:id/messages", auth, async (req, res) => {
    await roomAccess(db, req.user.id, req.params.id);
    const search = String(req.query.q || "")
        .toLowerCase()
        .slice(0, 100),
      before = req.query.before ? String(req.query.before) : null;
    let ms = (await db.list("messages", { room_id: req.params.id })).filter(
      (m) =>
        !m.deleted &&
        (!before || m.created_at < before) &&
        (!search || m.content.toLowerCase().includes(search)),
    );
    const bs = await db.list("blocks");
    ms = ms.filter(
      (m) =>
        !bs.some(
          (b) =>
            (b.user_id === req.user.id && b.target_id === m.user_id) ||
            (b.target_id === req.user.id && b.user_id === m.user_id),
        ),
    );
    ms.sort((a, b) => a.created_at.localeCompare(b.created_at));
    res.json(await Promise.all(ms.slice(-60).map(hydrate)));
  });
  const messageLimit = rateLimit({
    windowMs: 10000,
    limit: 12,
    keyGenerator: (req) => req.user.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  app.post("/api/rooms/:id/messages", auth, messageLimit, async (req, res) => {
    const room = await roomAccess(db, req.user.id, req.params.id, true);
    if (room.kind === "voice") fail(400, "Choose a text channel.");
    const v = z
      .object({
        content: z.string().trim().max(4000).default(""),
        reply_to: z.uuid().nullable().default(null),
        attachment_id: z.uuid().nullable().default(null),
      })
      .parse(req.body);
    if (!v.content && !v.attachment_id) fail(400, "Write a message first.");
    if (v.reply_to) {
      const reply = await db.get("messages", v.reply_to);
      if (reply?.room_id !== req.params.id) fail(400, "Invalid reply.");
    }
    if (v.attachment_id) {
      const a = await db.get("attachments", v.attachment_id);
      if (a?.user_id !== req.user.id || a.room_id !== req.params.id)
        fail(400, "Invalid attachment.");
    }
    const m = await db.insert("messages", {
      id: id(),
      room_id: req.params.id,
      user_id: req.user.id,
      ...v,
      created_at: now(),
      edited_at: null,
      deleted: false,
    });
    const data = await hydrate(m);
    publish(req.params.id, "message", data);
    res.status(201).json(data);
  });
  app.patch("/api/messages/:id", auth, async (req, res) => {
    const m = await db.get("messages", req.params.id);
    if (!m) fail(404, "Message not found.");
    await roomAccess(db, req.user.id, m.room_id, true);
    if (m.user_id !== req.user.id)
      fail(403, "You can only edit your own messages.");
    const { content } = z
      .object({ content: z.string().trim().min(1).max(4000) })
      .parse(req.body);
    const result = await hydrate(
      await db.update("messages", m.id, { content, edited_at: now() }),
    );
    publish(m.room_id, "message:update", result);
    res.json(result);
  });
  app.delete("/api/messages/:id", auth, async (req, res) => {
    const m = await db.get("messages", req.params.id);
    if (!m) fail(404, "Message not found.");
    const room = await roomAccess(db, req.user.id, m.room_id);
    if (m.user_id !== req.user.id) {
      if (!room.community_id)
        fail(403, "You can only remove your own messages.");
      await permission(db, req.user.id, room.community_id, "moderate_messages");
    }
    await db.update("messages", m.id, { deleted: true, content: "" });
    publish(m.room_id, "message:delete", { id: m.id });
    res.json({ ok: true });
  });
  app.post("/api/messages/:id/reactions", auth, async (req, res) => {
    const m = await db.get("messages", req.params.id);
    if (!m || m.deleted) fail(404, "Message not found.");
    await roomAccess(db, req.user.id, m.room_id);
    const { emoji } = z
      .object({ emoji: z.enum(["💜", "🔥", "👍", "✨", "😂", "👀"]) })
      .parse(req.body);
    const existing = (
      await db.list("reactions", {
        message_id: m.id,
        user_id: req.user.id,
        emoji,
      })
    )[0];
    if (existing) await db.remove("reactions", existing.id);
    else
      await db.insert("reactions", {
        id: id(),
        message_id: m.id,
        user_id: req.user.id,
        emoji,
      });
    const result = await hydrate(m);
    publish(m.room_id, "message:update", result);
    res.json(result);
  });
  app.post("/api/rooms/:id/read", auth, async (req, res) => {
    await roomAccess(db, req.user.id, req.params.id);
    const r = (
      await db.list("reads", { user_id: req.user.id, room_id: req.params.id })
    )[0];
    if (r) await db.update("reads", r.id, { read_at: now() });
    else
      await db.insert("reads", {
        id: id(),
        user_id: req.user.id,
        room_id: req.params.id,
        read_at: now(),
      });
    publish(req.params.id, "read", {
      user_id: req.user.id,
      room_id: req.params.id,
      read_at: now(),
    });
    res.json({ ok: true });
  });
  app.get("/api/friends", auth, async (req, res) => {
    const fs = (await db.list("friendships")).filter(
      (f) => f.sender_id === req.user.id || f.receiver_id === req.user.id,
    );
    res.json(
      await Promise.all(
        fs.map(async (f) => ({
          ...f,
          profile: safe(
            await db.get(
              "profiles",
              f.sender_id === req.user.id ? f.receiver_id : f.sender_id,
            ),
          ),
        })),
      ),
    );
  });
  app.post("/api/friends", auth, async (req, res) => {
    const { username } = z
      .object({ username: z.string().min(3).max(24) })
      .parse(req.body);
    const target = (
      await db.list("profiles", { username: username.toLowerCase() })
    )[0];
    if (!target || target.id === req.user.id) fail(404, "User not found.");
    if (await isBlocked(db, req.user.id, target.id))
      fail(403, "Friend request is unavailable.");
    if (
      (await db.list("friendships")).some(
        (f) =>
          [f.sender_id, f.receiver_id].includes(req.user.id) &&
          [f.sender_id, f.receiver_id].includes(target.id),
      )
    )
      fail(409, "A friendship or request already exists.");
    const f = await db.insert("friendships", {
      id: id(),
      sender_id: req.user.id,
      receiver_id: target.id,
      status: "pending",
      created_at: now(),
    });
    const n = await db.insert("notifications", {
      id: id(),
      user_id: target.id,
      text: req.user.display_name + " sent you a friend request.",
      read: false,
      created_at: now(),
    });
    publish("user:" + target.id, "notification", n);
    res.json(f);
  });
  app.patch("/api/friends/:id", auth, async (req, res) => {
    const f = await db.get("friendships", req.params.id);
    if (f?.receiver_id !== req.user.id)
      fail(403, "This request is not addressed to you.");
    res.json(await db.update("friendships", f.id, { status: "accepted" }));
  });
  app.delete("/api/friends/:id", auth, async (req, res) => {
    const f = await db.get("friendships", req.params.id);
    if (!f || ![f.sender_id, f.receiver_id].includes(req.user.id))
      fail(403, "Not allowed.");
    await db.remove("friendships", f.id);
    res.json({ ok: true });
  });
  app.get("/api/blocks", auth, async (req, res) =>
    res.json(
      await Promise.all(
        (await db.list("blocks", { user_id: req.user.id })).map(async (b) => ({
          ...b,
          profile: safe(await db.get("profiles", b.target_id)),
        })),
      ),
    ),
  );
  app.post("/api/blocks/:uid", auth, async (req, res) => {
    if (
      req.params.uid === req.user.id ||
      !(await db.get("profiles", req.params.uid))
    )
      fail(400, "Invalid user.");
    if (
      !(
        await db.list("blocks", {
          user_id: req.user.id,
          target_id: req.params.uid,
        })
      ).length
    )
      await db.insert("blocks", {
        id: id(),
        user_id: req.user.id,
        target_id: req.params.uid,
      });
    for (const s of await io.in("user:" + req.user.id).fetchSockets())
      s.disconnect(true);
    res.json({ ok: true });
  });
  app.delete("/api/blocks/:uid", auth, async (req, res) => {
    for (const b of await db.list("blocks", {
      user_id: req.user.id,
      target_id: req.params.uid,
    }))
      await db.remove("blocks", b.id);
    res.json({ ok: true });
  });
  app.post("/api/conversations", auth, async (req, res) => {
    const { user_ids, name } = z
      .object({
        user_ids: z.array(z.uuid()).min(1).max(8),
        name: z.string().max(40).default("Direct message"),
      })
      .parse(req.body);
    const users = [...new Set([req.user.id, ...user_ids])];
    for (const uid of users) {
      if (uid === req.user.id) continue;
      const p = await db.get("profiles", uid);
      if (!p || !p.allow_dms || (await isBlocked(db, req.user.id, uid)))
        fail(403, "This user is not accepting messages.");
    }
    if (users.length === 2) {
      for (const c of await db.list("conversations")) {
        const ms = await db.list("conversation_members", {
          conversation_id: c.id,
        });
        if (
          ms.length === 2 &&
          users.every((uid) => ms.some((m) => m.user_id === uid))
        )
          return res.json(c);
      }
    }
    const c = await db.insert("conversations", {
      id: id(),
      name,
      created_at: now(),
    });
    for (const uid of users) {
      await db.insert("conversation_members", {
        id: id(),
        conversation_id: c.id,
        user_id: uid,
      });
      publish("user:" + uid, "refresh", {});
    }
    res.json(c);
  });
  app.post("/api/reports", auth, async (req, res) => {
    const v = z
      .object({ message_id: z.uuid(), reason: z.string().min(5).max(500) })
      .parse(req.body);
    const m = await db.get("messages", v.message_id);
    if (!m) fail(404, "Message not found.");
    await roomAccess(db, req.user.id, m.room_id);
    res.json(
      await db.insert("reports", {
        id: id(),
        reporter_id: req.user.id,
        ...v,
        status: "open",
        created_at: now(),
      }),
    );
  });
  app.patch("/api/notifications/read", auth, async (req, res) => {
    for (const n of await db.list("notifications", { user_id: req.user.id }))
      if (!n.read) await db.update("notifications", n.id, { read: true });
    res.json({ ok: true });
  });
  app.get("/api/admin", auth, admin, async (req, res) =>
    res.json({
      users: (await db.list("profiles")).length,
      communities: (await db.list("communities")).length,
      messages: (await db.list("messages")).length,
      reports: await Promise.all(
        (await db.list("reports")).map(async (r) => ({
          ...r,
          message: await db.get("messages", r.message_id),
        })),
      ),
    }),
  );
  app.delete("/api/admin/messages/:id", auth, admin, async (req, res) => {
    const m = await db.get("messages", req.params.id);
    if (!m) fail(404, "Message not found.");
    await db.update("messages", m.id, { deleted: true, content: "" });
    await publish(m.room_id, "message:delete", { id: m.id });
    res.json({ ok: true });
  });
  app.patch("/api/admin/reports/:id", auth, admin, async (req, res) =>
    res.json(await db.update("reports", req.params.id, { status: "resolved" })),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });
  app.post(
    "/api/rooms/:id/upload",
    auth,
    async (req, res, next) => {
      try {
        await roomAccess(db, req.user.id, req.params.id, true);
        next();
      } catch (e) {
        next(e);
      }
    },
    upload.single("file"),
    async (req, res) => {
      if (!req.file) fail(400, "Choose a file.");
      const allowed = [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "video/mp4",
        "video/webm",
        "audio/mpeg",
        "audio/ogg",
        "application/pdf",
        "text/plain",
        "application/zip",
      ];
      if (!allowed.includes(req.file.mimetype))
        fail(400, "This file type is not supported.");
      const aid = id(),
        key = aid + "/" + safeFilename(req.file.originalname);
      if (db.supabase) {
        const { error } = await db.supabase.storage
          .from("attachments")
          .upload(key, req.file.buffer, { contentType: req.file.mimetype });
        if (error) throw error;
      } else {
        await fs.mkdir(path.resolve(options.directory || "data", "uploads"), {
          recursive: true,
        });
        await fs.writeFile(
          path.resolve(options.directory || "data", "uploads", aid),
          req.file.buffer,
        );
      }
      res.json(
        await db.insert("attachments", {
          id: aid,
          room_id: req.params.id,
          user_id: req.user.id,
          name: safeFilename(req.file.originalname),
          mime: req.file.mimetype,
          size: req.file.size,
          storage_key: key,
          created_at: now(),
        }),
      );
    },
  );
  app.get("/api/attachments/:id", auth, async (req, res) => {
    const a = await db.get("attachments", req.params.id);
    if (!a) fail(404, "File not found.");
    await roomAccess(db, req.user.id, a.room_id);
    if (await isBlocked(db, req.user.id, a.user_id))
      fail(403, "File is unavailable.");
    res.set("Content-Disposition", `attachment; filename="${a.name}"`);
    res.set("Content-Type", a.mime);
    if (db.supabase) {
      const { data, error } = await db.supabase.storage
        .from("attachments")
        .download(a.storage_key);
      if (error) throw error;
      res.send(Buffer.from(await data.arrayBuffer()));
    } else
      res.sendFile(path.resolve(options.directory || "data", "uploads", a.id));
  });
  app.get("/api/rtc", auth, (req, res) => {
    const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    if (process.env.TURN_URL && process.env.TURN_SECRET) {
      const username = `${Math.floor(Date.now() / 1000) + 3600}:${req.user.id}`;
      iceServers.push({
        urls: process.env.TURN_URL,
        username,
        credential: createHmac("sha1", process.env.TURN_SECRET)
          .update(username)
          .digest("base64"),
      });
    }
    res.json({ iceServers });
  });
  const voiceRooms = new Map(),
    burst = new Map();
  const limited = (s) => {
    const b = burst.get(s.id) || { at: Date.now(), count: 0 };
    if (Date.now() - b.at > 10000) {
      b.at = Date.now();
      b.count = 0;
    }
    burst.set(s.id, b);
    if (++b.count > 100) fail(429, "Slow down.");
  };
  io.use(async (s, next) => {
    try {
      const cookie = Object.fromEntries(
        (s.handshake.headers.cookie || "")
          .split(";")
          .map((v) => v.trim().split("=")),
      );
      s.data.user = await identify(cookie.nexora_session);
      s.data.sessionHash = cookie.nexora_session
        ? hash(cookie.nexora_session)
        : "";
      if (!s.data.user) return next(Error("Sign in required."));
      next();
    } catch {
      next(Error("Authentication failed."));
    }
  });
  io.on("connection", async (s) => {
    const uid = s.data.user.id;
    s.join("user:" + uid);
    for (const m of await db.list("members", { user_id: uid }))
      s.join("community:" + m.community_id);
    if (s.data.user.status !== "offline")
      io.emit("presence", { user_id: uid, status: s.data.user.status });
    const handle = (event, fn) =>
      s.on(event, async (data = {}, ack = () => {}) => {
        try {
          limited(s);
          const session = await db.get("sessions", s.data.sessionHash);
          if (!session || Date.parse(session.expires_at) < Date.now())
            fail(401, "Session expired.");
          const result = await fn(data);
          if (typeof ack === "function") ack({ ok: true, ...result });
        } catch (e) {
          if (typeof ack === "function") ack({ error: e.message });
        }
      });
    handle("room:join", async ({ room_id }) => {
      await roomAccess(db, uid, room_id);
      if (s.data.textRoom) s.leave(s.data.textRoom);
      s.data.textRoom = room_id;
      s.join(room_id);
    });
    handle("typing", async ({ room_id }) => {
      await roomAccess(db, uid, room_id, true);
      s.to(room_id).emit("typing", {
        room_id,
        user_id: uid,
        name: s.data.user.display_name,
      });
    });
    const leave = () => {
      const room = s.data.voiceRoom;
      if (room) {
        voiceRooms.get(room)?.delete(s.id);
        s.to("voice:" + room).emit("voice:left", { peer_id: s.id });
        s.leave("voice:" + room);
        if (!voiceRooms.get(room)?.size) voiceRooms.delete(room);
        s.data.voiceRoom = null;
      }
    };
    handle("voice:join", async ({ room_id }) => {
      const r = await roomAccess(db, uid, room_id);
      if (r.kind && r.kind !== "voice")
        fail(400, "This is not a voice channel.");
      const peers = voiceRooms.get(room_id) || new Set();
      if (peers.size >= 6)
        fail(409, "This room has reached its six-person call limit.");
      for (const pid of peers) {
        const peer = io.sockets.sockets.get(pid);
        if (peer && (await isBlocked(db, uid, peer.data.user.id)))
          fail(403, "A blocked participant is in this room.");
      }
      leave();
      const existing = [...peers].map((pid) => ({
        peer_id: pid,
        profile: safe(io.sockets.sockets.get(pid)?.data.user),
      }));
      peers.add(s.id);
      voiceRooms.set(room_id, peers);
      if (!r.kind && peers.size === 1) {
        for (const m of await db.list("conversation_members", {
          conversation_id: room_id,
        })) {
          if (m.user_id !== uid)
            publish("user:" + m.user_id, "call:invite", {
              room: { id: room_id, name: r.name },
              caller: s.data.user.display_name,
            });
        }
      }
      s.data.voiceRoom = room_id;
      s.join("voice:" + room_id);
      s.to("voice:" + room_id).emit("voice:joined", {
        peer_id: s.id,
        profile: safe(s.data.user),
      });
      return { peers: existing };
    });
    handle("voice:signal", async ({ to, description, candidate }) => {
      const target = io.sockets.sockets.get(to);
      if (
        !target ||
        !s.data.voiceRoom ||
        target.data.voiceRoom !== s.data.voiceRoom
      )
        fail(403, "Peer is not in your call.");
      await roomAccess(db, uid, s.data.voiceRoom);
      if (await isBlocked(db, uid, target.data.user.id))
        fail(403, "Peer is blocked.");
      target.emit("voice:signal", {
        from: s.id,
        description,
        candidate,
        profile: safe(s.data.user),
      });
    });
    handle("voice:leave", async () => leave());
    s.on("disconnect", async () => {
      leave();
      burst.delete(s.id);
      const others = await io.in("user:" + uid).fetchSockets();
      if (!others.length)
        io.emit("presence", { user_id: uid, status: "offline" });
    });
  });
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use(express.static(path.resolve("dist")));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.resolve("dist/index.html")),
  );
  app.use((err, req, res, next) => {
    if (err instanceof z.ZodError)
      return res
        .status(400)
        .json({ error: err.issues[0]?.message || "Invalid input." });
    if (err.code === "LIMIT_FILE_SIZE")
      return res.status(413).json({ error: "Files must be 10 MB or smaller." });
    const status = err.status || (err.code === "23505" ? 409 : 500);
    if (status === 500) console.error(err.message);
    res
      .status(status)
      .json({
        error:
          status === 500
            ? "Something went wrong. Please try again."
            : err.message,
      });
  });
  return { app, http, io, db };
}
if (process.env.NODE_ENV !== "test") {
  const { http } = await createApp();
  http.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
    console.log(
      `NEXORA API listening on http://localhost:${process.env.PORT || 3001}`,
    ),
  );
}

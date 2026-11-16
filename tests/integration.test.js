import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { io as client } from "socket.io-client";
process.env.NODE_ENV = "test";
process.env.APP_ORIGIN = "http://localhost:5173";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { createApp } = await import("../server/index.js");
const origin = "http://localhost:5173";
function event(socket, name) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error("Timeout waiting for " + name)),
      3000,
    );
    socket.once(name, (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
}
function emit(socket, name, data) {
  return new Promise((resolve, reject) =>
    socket
      .timeout(3000)
      .emit(name, data, (error, value) =>
        error ? reject(error) : resolve(value),
      ),
  );
}
test("NEXORA real API, authorization, persistence, and realtime integration", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-test-"));
  const { http, io, db } = await createApp({ directory, noSeed: true });
  await new Promise((r) => http.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + http.address().port;
  const sockets = [];
  async function request(
    route,
    { method = "GET", data, cookie, requestOrigin = origin } = {},
  ) {
    const r = await fetch(url + "/api" + route, {
      method,
      headers: {
        Origin: requestOrigin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(data instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body:
        data === undefined
          ? undefined
          : data instanceof FormData
            ? data
            : JSON.stringify(data),
    });
    const body = r.headers.get("content-type")?.includes("json")
      ? await r.json()
      : await r.text();
    return {
      status: r.status,
      body,
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  }
  async function account(name) {
    const r = await request("/auth/register", {
      method: "POST",
      data: {
        email: name + "@example.test",
        password: "Nexora-test-only-123!",
        username: name,
      },
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.registered, true);
    assert.equal(r.cookie, undefined);
    const login = await request("/auth/login", {
      method: "POST",
      data: {
        email: name + "@example.test",
        password: "Nexora-test-only-123!",
      },
    });
    assert.equal(login.status, 200);
    return { id: login.body.user.id, cookie: login.cookie };
  }
  async function connect(account) {
    const socket = client(url, {
      transports: ["websocket"],
      extraHeaders: { Origin: origin, Cookie: account.cookie },
      reconnection: false,
    });
    sockets.push(socket);
    await event(socket, "connect");
    return socket;
  }
  try {
    let alice,
      bob,
      outsider,
      community,
      channel,
      voice,
      announcement,
      message,
      dm,
      group,
      sa,
      sb;
    await t.test(
      "registers unique users, hashes passwords and sets opaque sessions",
      async () => {
        alice = await account("alice");
        bob = await account("bobby");
        outsider = await account("outsider");
        const p = await db.get("profiles", alice.id);
        assert.match(p.password_hash, /^\$2/);
        const me = await request("/auth/me", { cookie: alice.cookie });
        assert.equal(me.body.user.password_hash, undefined);
        assert.equal(me.body.user.email, undefined);
        assert.equal(
          (
            await request("/auth/register", {
              method: "POST",
              data: {
                email: "other@example.test",
                password: "Nexora-test-only-123!",
                username: "alice",
              },
            })
          ).status,
          409,
        );
      },
    );
    await t.test(
      "rejects forged origin and unauthenticated actions",
      async () => {
        assert.equal(
          (
            await request("/communities", {
              method: "POST",
              data: { name: "Bad" },
              cookie: alice.cookie,
              requestOrigin: "https://evil.example",
            })
          ).status,
          403,
        );
        assert.equal((await request("/bootstrap")).status, 401);
        assert.equal(
          (
            await request("/auth/login", {
              method: "POST",
              data: { email: "alice@example.test", password: "incorrect" },
            })
          ).status,
          401,
        );
        assert.equal(
          (
            await request("/auth/login", {
              method: "POST",
              data: {
                email: "alice@example.test",
                password: "Nexora-test-only-123!",
              },
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "private player servers are hidden and require an invitation",
      async () => {
        community = (
          await request("/communities", {
            method: "POST",
            cookie: alice.cookie,
            data: {
              name: "Private players",
              is_public: false,
              category: "Gaming",
            },
          })
        ).body;
        const boot = (await request("/bootstrap", { cookie: alice.cookie }))
          .body;
        channel = boot.channels.find((c) => c.kind === "text");
        voice = boot.channels.find((c) => c.kind === "voice");
        assert.equal((await request("/discover")).body.length, 0);
        assert.equal(
          (
            await request("/communities/" + community.id + "/join", {
              method: "POST",
              data: {},
              cookie: bob.cookie,
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await request("/rooms/" + channel.id + "/messages", {
              cookie: bob.cookie,
            })
          ).status,
          403,
        );
        const invite = await request(
          "/communities/" + community.id + "/invites",
          { method: "POST", data: {}, cookie: alice.cookie },
        );
        const code = new URL(invite.body.url).searchParams.get("invite");
        assert.equal(
          (
            await request("/invites/" + code, {
              method: "POST",
              data: {},
              cookie: bob.cookie,
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "enforces channel management and announcement posting",
      async () => {
        assert.equal(
          (
            await request("/communities/" + community.id + "/channels", {
              method: "POST",
              cookie: bob.cookie,
              data: { name: "unauthorized", kind: "text" },
            })
          ).status,
          403,
        );
        announcement = (
          await request("/communities/" + community.id + "/channels", {
            method: "POST",
            cookie: alice.cookie,
            data: { name: "news", kind: "announcement" },
          })
        ).body;
        assert.equal(
          (
            await request("/rooms/" + announcement.id + "/messages", {
              method: "POST",
              cookie: bob.cookie,
              data: { content: "not allowed" },
            })
          ).status,
          403,
        );
      },
    );
    await t.test(
      "sends messages over authenticated WebSockets and rejects private-room intrusion",
      async () => {
        sa = await connect(alice);
        sb = await connect(bob);
        assert.equal(
          (await emit(sa, "room:join", { room_id: channel.id })).ok,
          true,
        );
        assert.equal(
          (await emit(sb, "room:join", { room_id: channel.id })).ok,
          true,
        );
        const received = event(sb, "message");
        message = (
          await request("/rooms/" + channel.id + "/messages", {
            method: "POST",
            cookie: alice.cookie,
            data: { content: "Ready for the next match?" },
          })
        ).body;
        assert.equal((await received).id, message.id);
        const sc = await connect(outsider);
        assert.match(
          (await emit(sc, "room:join", { room_id: channel.id })).error,
          /Join/,
        );
      },
    );
    await t.test(
      "supports replies, edits, reactions and history search",
      async () => {
        assert.equal(
          (
            await request("/messages/" + message.id, {
              method: "PATCH",
              cookie: bob.cookie,
              data: { content: "hijack" },
            })
          ).status,
          403,
        );
        const edit = await request("/messages/" + message.id, {
          method: "PATCH",
          cookie: alice.cookie,
          data: { content: "Ready for the ranked match?" },
        });
        assert.ok(edit.body.edited_at);
        const reply = await request("/rooms/" + channel.id + "/messages", {
          method: "POST",
          cookie: bob.cookie,
          data: { content: "Let’s go!", reply_to: message.id },
        });
        assert.equal(reply.body.reply_to, message.id);
        assert.equal(
          (
            await request("/messages/" + message.id + "/reactions", {
              method: "POST",
              cookie: bob.cookie,
              data: { emoji: "🔥" },
            })
          ).body.reactions.length,
          1,
        );
        assert.equal(
          (
            await request("/rooms/" + channel.id + "/messages?q=ranked", {
              cookie: bob.cookie,
            })
          ).body.length,
          1,
        );
      },
    );
    await t.test(
      "keeps uploads private and validates room ownership",
      async () => {
        const fd = new FormData();
        fd.append(
          "file",
          new Blob(["a private team note"], { type: "text/plain" }),
          "strategy.txt",
        );
        const upload = await request("/rooms/" + channel.id + "/upload", {
          method: "POST",
          cookie: alice.cookie,
          data: fd,
        });
        assert.equal(upload.status, 200);
        assert.equal(
          (
            await request("/attachments/" + upload.body.id, {
              cookie: outsider.cookie,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request("/attachments/" + upload.body.id, {
              cookie: bob.cookie,
            })
          ).body,
          "a private team note",
        );
      },
    );
    await t.test(
      "supports friends and private group conversations",
      async () => {
        const f = (
          await request("/friends", {
            method: "POST",
            cookie: alice.cookie,
            data: { username: "bobby" },
          })
        ).body;
        assert.equal(
          (
            await request("/friends/" + f.id, {
              method: "PATCH",
              cookie: outsider.cookie,
              data: {},
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request("/friends/" + f.id, {
              method: "PATCH",
              cookie: bob.cookie,
              data: {},
            })
          ).status,
          200,
        );
        dm = (
          await request("/conversations", {
            method: "POST",
            cookie: alice.cookie,
            data: { user_ids: [bob.id], name: "Squad chat" },
          })
        ).body;
        assert.equal(
          (
            await request("/rooms/" + dm.id + "/messages", {
              cookie: outsider.cookie,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request("/rooms/" + dm.id + "/messages", {
              method: "POST",
              cookie: bob.cookie,
              data: { content: "Private squad plans" },
            })
          ).status,
          201,
        );
        group = (
          await request("/conversations", {
            method: "POST",
            cookie: alice.cookie,
            data: {
              user_ids: [bob.id, outsider.id],
              name: "Three-player party",
            },
          })
        ).body;
        assert.equal(
          (await db.list("conversation_members", { conversation_id: group.id }))
            .length,
          3,
        );
      },
    );
    await t.test("authorizes voice membership and peer signaling", async () => {
      assert.equal(
        (await emit(sa, "voice:join", { room_id: voice.id })).ok,
        true,
      );
      const joined = await emit(sb, "voice:join", { room_id: voice.id });
      assert.equal(joined.peers.length, 1);
      const signal = event(sb, "voice:signal");
      assert.equal(
        (
          await emit(sa, "voice:signal", {
            to: sb.id,
            description: { type: "offer", sdp: "test-signaling-payload" },
          })
        ).ok,
        true,
      );
      assert.equal((await signal).from, sa.id);
      assert.match(
        (
          await emit(sa, "voice:signal", {
            to: sockets[2].id,
            candidate: { candidate: "bad" },
          })
        ).error,
        /Peer/,
      );
    });
    await t.test(
      "three-player group calls invite members and authorize every participant",
      async () => {
        const invitation = event(sb, "call:invite");
        assert.equal(
          (await emit(sa, "voice:join", { room_id: group.id })).ok,
          true,
        );
        assert.equal((await invitation).room.id, group.id);
        assert.equal(
          (await emit(sb, "voice:join", { room_id: group.id })).peers.length,
          1,
        );
        assert.equal(
          (await emit(sockets[2], "voice:join", { room_id: group.id })).peers
            .length,
          2,
        );
        await emit(sockets[2], "voice:leave", {});
        await emit(sa, "voice:join", { room_id: voice.id });
        await emit(sb, "voice:join", { room_id: voice.id });
      },
    );
    await t.test(
      "roles grant only assigned powers; members cannot escalate roles",
      async () => {
        const role = (
          await request("/communities/" + community.id + "/roles", {
            method: "POST",
            cookie: alice.cookie,
            data: { name: "Moderator", permissions: ["moderate_messages"] },
          })
        ).body;
        assert.equal(
          (
            await request(
              "/communities/" + community.id + "/members/" + bob.id,
              {
                method: "PATCH",
                cookie: bob.cookie,
                data: { role_id: role.id },
              },
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              "/communities/" + community.id + "/members/" + bob.id,
              {
                method: "PATCH",
                cookie: alice.cookie,
                data: { role_id: role.id },
              },
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request("/messages/" + message.id, {
              method: "DELETE",
              cookie: bob.cookie,
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "blocking prevents direct messages, history, and shared voice access",
      async () => {
        assert.equal(
          (
            await request("/blocks/" + alice.id, {
              method: "POST",
              cookie: bob.cookie,
              data: {},
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await request("/rooms/" + dm.id + "/messages", {
              cookie: alice.cookie,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await request("/conversations", {
              method: "POST",
              cookie: alice.cookie,
              data: { user_ids: [bob.id], name: "Bypass" },
            })
          ).status,
          403,
        );
        sb = await connect(bob);
        assert.match(
          (await emit(sb, "voice:join", { room_id: voice.id })).error,
          /blocked/,
        );
      },
    );
    await t.test("bans remove membership and prevent rejoining", async () => {
      assert.equal(
        (
          await request(
            "/communities/" + community.id + "/members/" + bob.id + "?ban=true",
            { method: "DELETE", cookie: alice.cookie },
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request("/rooms/" + channel.id + "/messages", {
            cookie: bob.cookie,
          })
        ).status,
        403,
      );
      const inv = (
        await request("/communities/" + community.id + "/invites", {
          method: "POST",
          cookie: alice.cookie,
          data: {},
        })
      ).body;
      assert.equal(
        (
          await request(
            "/invites/" + new URL(inv.url).searchParams.get("invite"),
            { method: "POST", cookie: bob.cookie, data: {} },
          )
        ).status,
        403,
      );
    });
    await t.test(
      "admin endpoints reject ordinary users, signout revokes the session",
      async () => {
        assert.equal(
          (await request("/admin", { cookie: alice.cookie })).status,
          403,
        );
        assert.equal(
          (
            await request("/auth/logout", {
              method: "POST",
              cookie: alice.cookie,
              data: {},
            })
          ).status,
          200,
        );
        assert.equal(
          (await request("/bootstrap", { cookie: alice.cookie })).status,
          401,
        );
      },
    );
    await t.test(
      "persists messages and community records to disk",
      async () => {
        const stored = JSON.parse(
          await fs.readFile(path.join(directory, "nexora.json"), "utf8"),
        );
        assert.ok(
          stored.messages.some((m) => m.content === "Private squad plans"),
        );
        assert.equal(stored.communities[0].name, "Private players");
      },
    );
  } finally {
    for (const s of sockets) s.disconnect();
    await new Promise((r) => io.close(r));
    if (http.listening) await new Promise((r) => http.close(r));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

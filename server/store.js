import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
export const tables = [
  "profiles",
  "communities",
  "members",
  "channels",
  "messages",
  "reactions",
  "friendships",
  "blocks",
  "invites",
  "reports",
  "conversations",
  "conversation_members",
  "reads",
  "notifications",
  "roles",
  "attachments",
  "sessions",
  "bans",
];
export function createStore({ url, key, directory = "data" } = {}) {
  const supabase =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  let state,
    queue = Promise.resolve();
  const file = path.resolve(directory, "nexora.json");
  async function init() {
    if (supabase) return;
    await fs.mkdir(directory, { recursive: true });
    try {
      state = JSON.parse(await fs.readFile(file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      state = Object.fromEntries(tables.map((t) => [t, []]));
    }
    for (const t of tables) state[t] ??= [];
  }
  function persist() {
    const snapshot = JSON.stringify(state);
    queue = queue.then(async () => {
      await fs.writeFile(file + ".tmp", snapshot);
      await fs.rename(file + ".tmp", file);
    });
    return queue;
  }
  async function list(t, filters = {}) {
    if (!tables.includes(t)) throw Error("Invalid table");
    if (supabase) {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        let q = supabase
          .from(t)
          .select("*")
          .order("id")
          .range(from, from + 999);
        for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
        const { data, error } = await q;
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) break;
      }
      return rows;
    }
    return structuredClone(
      state[t].filter((row) =>
        Object.entries(filters).every(([k, v]) => row[k] === v),
      ),
    );
  }
  async function get(t, id) {
    return (await list(t, { id }))[0];
  }
  async function insert(t, row) {
    if (supabase) {
      const { data, error } = await supabase
        .from(t)
        .insert(row)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const unique = {
      profiles: [["username"], ["email"]],
      members: [["community_id", "user_id"]],
      conversation_members: [["conversation_id", "user_id"]],
      reactions: [["message_id", "user_id", "emoji"]],
      blocks: [["user_id", "target_id"]],
      bans: [["community_id", "user_id"]],
      reads: [["user_id", "room_id"]],
    };
    for (const keys of [["id"], ...(unique[t] || [])])
      if (
        keys.every((k) => row[k] !== undefined) &&
        state[t].some((r) => keys.every((k) => r[k] === row[k]))
      ) {
        const e = Error("This record already exists.");
        e.status = 409;
        throw e;
      }
    state[t].push(structuredClone(row));
    await persist();
    return row;
  }
  async function update(t, id, patch) {
    if (supabase) {
      const { data, error } = await supabase
        .from(t)
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const row = state[t].find((r) => r.id === id);
    if (!row) throw Error("Not found");
    Object.assign(row, patch);
    await persist();
    return structuredClone(row);
  }
  async function remove(t, id) {
    if (supabase) {
      const { error } = await supabase.from(t).delete().eq("id", id);
      if (error) throw error;
      return;
    }
    state[t] = state[t].filter((r) => r.id !== id);
    await persist();
  }
  return { init, list, get, insert, update, remove, supabase };
}

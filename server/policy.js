export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (status, message) => {
  throw new HttpError(status, message);
};
export async function isBlocked(db, a, b) {
  return (await db.list("blocks")).some(
    (r) =>
      (r.user_id === a && r.target_id === b) ||
      (r.user_id === b && r.target_id === a),
  );
}
export async function membership(db, user, community) {
  const member = (
    await db.list("members", { community_id: community, user_id: user })
  )[0];
  if (!member) fail(403, "Join this community first.");
  return member;
}
export async function permission(db, user, community, action) {
  const c = await db.get("communities", community);
  if (!c) fail(404, "Community not found.");
  const m = await membership(db, user, community);
  if (c.owner_id === user) return m;
  const role = m.role_id ? await db.get("roles", m.role_id) : null;
  if (!role?.permissions?.includes(action))
    fail(403, "You do not have permission to do that.");
  return m;
}
export async function roomAccess(db, user, room, write = false) {
  const c = await db.get("channels", room);
  if (c) {
    await membership(db, user, c.community_id);
    if (write && c.kind === "announcement")
      await permission(db, user, c.community_id, "manage_channels");
    return c;
  }
  const conversation = await db.get("conversations", room);
  if (!conversation) fail(404, "Channel not found.");
  const ms = await db.list("conversation_members", { conversation_id: room });
  if (!ms.some((m) => m.user_id === user))
    fail(403, "This conversation is private.");
  for (const m of ms)
    if (m.user_id !== user && (await isBlocked(db, user, m.user_id)))
      fail(403, "This conversation is blocked.");
  return conversation;
}
export function publicProfile(p) {
  if (!p) return null;
  const { password_hash, email, ...safe } = p;
  return safe;
}
export function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 100) || "file";
}

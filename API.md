# NEXORA API

All endpoints use `/api`. Authenticated endpoints require the `nexora_session` HttpOnly cookie. JSON errors use `{ "error": "message" }`. Mutation requests must send the configured `APP_ORIGIN` as their Origin. No frontend bearer/API key is needed. JSON bodies are limited to 32 KB.

| Method      | Route                                    | Purpose / body                                                                |
| ----------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| GET         | `/health`, `/config`                     | Health and non-secret configuration                                           |
| POST        | `/auth/register`                         | `{email,password,username}`; creates account, **does not log in**             |
| POST        | `/auth/login`                            | `{email,password}`; establishes session                                       |
| GET         | `/auth/google`                           | Starts Google PKCE OAuth                                                      |
| GET         | `/auth/callback?code=…`                  | Server OAuth callback; code verifier cookie required                          |
| GET         | `/auth/me`                               | Current public profile and admin flag                                         |
| POST        | `/auth/logout`                           | Revokes session and disconnects its sockets                                   |
| PATCH       | `/profile`                               | Whitelisted display_name, bio, status, activity, allow_dms, color, avatar_url |
| GET         | `/bootstrap`                             | Joined communities/channels, private conversations, notifications             |
| GET         | `/discover`                              | Public communities only                                                       |
| POST        | `/communities`                           | `{name,description?,is_public?,category?}`; defaults private                  |
| POST        | `/communities/:id/join`                  | Join a public community; bans checked                                         |
| POST        | `/communities/:id/channels`              | `{name,kind,description?}`; authorized channel managers                       |
| GET         | `/communities/:id/members`               | Member-only member list                                                       |
| GET/POST    | `/communities/:id/roles`                 | List roles / owner creates `{name,permissions}`                               |
| PATCH       | `/communities/:id/members/:uid`          | Owner assigns `{role_id}` or null                                             |
| DELETE      | `/communities/:id/members/:uid?ban=true` | Authorized member manager removes/bans                                        |
| POST        | `/communities/:id/invites`               | Member creates seven-day link                                                 |
| POST        | `/invites/:code`                         | Redeem unexpired invite; bans checked                                         |
| GET         | `/rooms/:id/messages?q=…&before=…`       | Authorized history/search, last 60 results                                    |
| POST        | `/rooms/:id/messages`                    | `{content,reply_to?,attachment_id?}`                                          |
| PATCH       | `/messages/:id`                          | Author edits `{content}`                                                      |
| DELETE      | `/messages/:id`                          | Author or authorized community moderator removes                              |
| POST        | `/messages/:id/reactions`                | Toggle `{emoji}` from supported choices                                       |
| POST        | `/rooms/:id/read`                        | Mark room read and broadcast read event                                       |
| POST        | `/rooms/:id/upload`                      | Multipart `file`, max 10 MB                                                   |
| GET         | `/attachments/:id`                       | Private authenticated download                                                |
| GET/POST    | `/friends`                               | List friendships / send `{username}` request                                  |
| PATCH       | `/friends/:id`                           | Recipient accepts request                                                     |
| DELETE      | `/friends/:id`                           | Remove friendship / decline / cancel                                          |
| GET         | `/blocks`                                | Current user's block list                                                     |
| POST/DELETE | `/blocks/:uid`                           | Block / unblock                                                               |
| POST        | `/conversations`                         | `{user_ids:[uuid,…],name}`; private DM/group                                  |
| POST        | `/reports`                               | `{message_id,reason}`; message must be accessible                             |
| PATCH       | `/notifications/read`                    | Mark own notifications read                                                   |
| GET         | `/rtc`                                   | Authenticated ICE configuration, expiring TURN credentials                    |
| GET         | `/admin`                                 | Operator-allowlisted users only; metrics and reports                          |
| PATCH       | `/admin/reports/:id`                     | Resolve report                                                                |
| DELETE      | `/admin/messages/:id`                    | Remove reported or abusive message                                            |

Socket.IO uses the same session cookie and allowed Origin. Client emits acknowledge with `{ok:true,…}` or `{error}`.

| Client event   | Body                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| `room:join`    | `{room_id}`; authorizes, replaces active text subscription              |
| `typing`       | `{room_id}`; write access required                                      |
| `voice:join`   | `{room_id}`; voice channel/private conversation; returns existing peers |
| `voice:signal` | `{to,description? ,candidate?}`; peers must share authorized voice room |
| `voice:leave`  | `{}`; releases voice membership                                         |

Server events: `message`, `message:update`, `message:delete`, `typing`, `read`, `presence`, `profile`, `notification`, `refresh`, `voice:joined`, `voice:left`, `voice:signal`, `call:invite`. Message delivery filters blocked senders. Calls are not recorded. Media uses peer-to-peer WebRTC with DTLS-SRTP; this application does not implement an additional application-level E2EE protocol.

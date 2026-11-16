# NEXORA

An original, open-source community communication app. React + TypeScript + Tailwind CSS on the frontend; Express + Socket.IO on the backend; WebRTC for calls; Supabase for production authentication, PostgreSQL, and private file storage.

## Run locally

Install Node.js 22.12 or newer, open a terminal in this folder, and run:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open **http://localhost:5173**. The backend runs on port 3001. `npm run dev` starts both services. The first screen is account creation. Create an account, then **log in separately**, as requested. Passwords require at least 10 characters. Usernames accept 3–24 lowercase letters, digits, and underscores.

With Supabase settings blank, a real local backend stores accounts, hashed passwords, communities, messages, and uploads in the ignored `data/` directory. This development mode works across browsers/devices that can reach the same backend. It is not an isolated browser-only mock. Local mode has no email delivery or Google authentication. Never deploy local mode to a public server; production startup refuses to run without Supabase.

The optional `/?preview=1` route shows a labeled sample interface. It does not bypass backend authorization. Real accounts and all live features still require authentication. Sample profiles are fictional and their statuses are illustrative. A local database includes sample public communities; production Supabase starts empty.

## What is implemented

- Account-first entry, separate email/password registration and login; Google OAuth with server-side PKCE code exchange. Seven-day opaque, HttpOnly application sessions; logout revocation.
- Unique usernames, display names, HTTPS avatar URLs, bios, manual presence/activity status, and direct-message privacy controls.
- Private-by-default player communities. Optional public discovery. Expiring seven-day invitations. Unlimited community creation within host/database capacity.
- Text, announcement, and voice channels. Owner-created roles, channel management, message moderation, role assignment, and member bans.
- Authenticated Socket.IO messaging, typing events, read events, replies, edit/delete, six reaction options, search, and paginated conversation history (60 messages per response).
- Private one-to-one and group conversations, up to eight invited members plus the creator. Friend requests, acceptance/decline/removal, bidirectional blocking enforcement.
- Private file sharing up to 10 MB. Images, video, audio, PDF, text, and ZIP attachments download through an authenticated API. Attachments are not public URLs.
- Group voice/video calls and screen sharing in voice channels and private conversations. Up to six simultaneous connections per call. Microphone, camera, deafen, screen share, voice activity, and leave controls. Group members receive an incoming-call alert.
- Notifications, report submission, administrator report review and message removal, three themes, and English/Tamil core navigation. Tamil translation is currently partial: management forms, help, errors, and some copy remain English.
- Original vector logo, CSS artwork, responsive layouts, keyboard-accessible native dialogs, reduced-motion support, and Lucide open-source icons. No Discord assets.

## Try a private player community and group call

1. Register two or more users in separate browser profiles; log in to each.
2. Press **+** in the community rail. Enter a name; keep **Show in community discovery** unchecked. Choose Gaming if desired.
3. Use **Invite people**. Share the generated link with the other signed-in users. Non-members cannot discover or read the private server.
4. Pick `general` to exchange messages, or **The Lounge** to start a voice/video call.
5. For a standalone private group, send and accept friend requests, then choose **Friends → New group**. Select friends and name the group.
6. Open the group and press the headphones icon. Other group members receive a **Join call** alert. Enable cameras or screen sharing using the call controls.

Browser media requires **HTTPS or localhost**. Ordinary HTTP on a LAN IP does not provide camera/microphone APIs in most browsers. For real device testing, deploy over HTTPS. Clicking Join requests microphone permission; camera and screen permissions are requested only when their controls are used.

## Supabase setup — required for real Google login and production

1. Create a Supabase project at https://supabase.com/dashboard. Keep its database password private.
2. Run **`supabase/schema.sql`** once in its SQL Editor. This creates 18 application tables, indexes, restrictive access rules, and a private `attachments` bucket.
3. Under project API settings, copy the project URL, public anon key, and server/service-role key into `.env` on the **server only**:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_SERVICE_ROLE_KEY
```

The anon key is deliberately kept on the server too. **Never prefix any credential with `VITE_`**. Vite exposes prefixed values in browser bundles. No Supabase key is needed in browser code.

4. Under **Authentication → Providers**, enable Email and choose your email-confirmation policy. Under **URL Configuration**, set Site URL to your app origin. Add your app origin and the exact callback URL to the redirect allowlist:

```text
http://localhost:5173
http://localhost:5173/api/auth/callback
https://YOUR_DEPLOYED_APP
https://YOUR_DEPLOYED_APP/api/auth/callback
```

For local development, Vite proxies the callback to Express. Set `APP_ORIGIN=http://localhost:5173`. For a same-origin deployed app, use its HTTPS origin without a trailing slash. If the backend is separately hosted, set `SERVER_ORIGIN` to that backend origin and allow its callback URL instead; same-origin hosting is strongly preferred for cookie reliability.

5. In Google Cloud Console, configure the OAuth consent screen and create an **OAuth client ID → Web application**. Use the exact **Supabase callback URL** shown in the Google provider panel as Google's authorized redirect URI:

```text
https://YOUR_PROJECT.supabase.co/auth/v1/callback
```

That Google redirect is different from your app callback. Google returns to Supabase; Supabase returns to NEXORA. Add your development/production origins to Google's authorized JavaScript origins as applicable. If the Google consent application is in testing, add your test users; external users need the appropriate published consent configuration.

6. Paste Google's client ID and secret into **Supabase → Authentication → Providers → Google**, and enable it. Keep the Google secret in Supabase, never in the frontend.
7. Restart NEXORA. **Continue with Google** becomes available in Supabase mode. It redirects to Google, exchanges a PKCE code on the server, creates the user's profile if necessary, and issues the same HttpOnly app session used by email login. Google handles account creation and sign-in as one federated flow; email registration always requires the separate login step.

Google OAuth cannot be activated without your project/provider configuration. The source implements it, but it has not been exercised against a live project in this delivery. To confirm setup, sign in with a Google test user, reload, verify your profile, sign out, and verify `/api/auth/me` returns 401. Email confirmation delivery also needs testing with your project; configure custom SMTP if the built-in mail service's restrictions are unsuitable.

Official references: [Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow).

## Production deployment

The recommended deployment is a **single Node service** that serves both the React build and Express/Socket.IO, with Supabase as the database. This keeps browser cookies first-party and supports long-lived WebSocket connections.

```powershell
npm ci
npm run build
$env:NODE_ENV='production'
npm start
```

Set `APP_ORIGIN` to the exact HTTPS origin. Set the three Supabase variables. Set `TRUST_PROXY=1` only when running behind one known reverse proxy, such as Render. Never set it indiscriminately on an untrusted network.

**Render:** push the source to a repository you own, create a Blueprint using `render.yaml` (or a Node web service), and supply its environment values. Build: `npm ci && npm run build`. Start: `npm start`. Health check: `/api/health`. The app binds `0.0.0.0:$PORT`. Use the same Render HTTPS URL for `APP_ORIGIN`, Supabase Site URL, and the app callback allowlist. Do not use a static-only host for the Node backend.

**Static frontend hosting / Sites:** `dist/` can be hosted separately as an interface preview. A static deployment alone cannot run Express, Socket.IO, accounts, or signaling. It intentionally reports “Backend setup needed.” A live separate API requires `VITE_API_URL` at build time, exact CORS configuration, appropriate cookie policy, and compatible browser cookie settings. Prefer deploying the whole app at one origin; the included default uses `SameSite=Lax` and therefore does not support unrelated cross-site API cookies. The local server and the published static preview are distinct deployments.

**TURN for reliable calls:** STUN-only peer connections can fail behind restrictive NAT/firewalls. Provision an open-source [coturn](https://github.com/coturn/coturn) server using time-limited REST authentication. Configure:

```dotenv
TURN_URL=turns:turn.your-domain.example:5349
TURN_SECRET=YOUR_COTURN_STATIC_AUTH_SECRET
```

NEXORA generates one-hour TURN credentials on the authenticated `/api/rtc` endpoint. The static TURN secret never leaves the server. Coturn needs correctly exposed relay ports and a valid TLS certificate. There is no promise of reliable worldwide calling without TURN capacity.

## Administrator and permissions

Set `ADMIN_USER_IDS` to a comma-separated list of **profile UUIDs** chosen by the operator, then restart the server. These users see **Settings → Admin dashboard**, which lists reports and supports removing reported messages and resolving reports. Users cannot promote themselves via API or profile edits. Community ownership and custom roles are independent of platform admin status.

Every application table has RLS enabled and direct `anon`/`authenticated` grants revoked. The backend uses the service role and checks membership, ownership/role permissions, privacy, and blocking itself. There are intentionally no browser-facing RLS policies. Keep service-role credentials private. The private storage bucket has no public read policy. TLS is required in production.

Sessions use random 256-bit tokens, store only hashes, and expire after seven days. Supabase access/refresh tokens and passwords are not stored in the app session table. The app issues its own session after successful Supabase authentication: changing a password in Supabase does **not** automatically revoke existing NEXORA sessions. For a compromised account, delete that user's rows from `public.sessions` and restart the service to disconnect any live calls. Remove expired session rows periodically. Local development password hashes use bcrypt cost 12.

Rate limits: 180 API requests/minute/IP, 30 authentication attempts/15 minutes/IP, 12 message sends/10 seconds/user, and 100 Socket.IO events/10 seconds/socket. These are single-process limits. Profiles/messages are rendered as text, not raw HTML. Helmet adds security headers; mutations require the exact allowed Origin; Socket.IO handshake and every room operation check authentication/authorization. Uploaded files are private downloads with a MIME allowlist, size limit, attachment disposition, and `nosniff`; there is no antivirus scanning.

## Free-tier limits and honest operating costs

NEXORA has no paid subscription gates. Infrastructure is not inherently unlimited or always free.

- Supabase's free plan currently includes a **500 MB database per project** and **two active free projects**. Storage, egress, monthly users, email, and other quotas apply; review current pricing before launch. Backups, higher quotas, and production reliability may require paid services. [Supabase pricing](https://supabase.com/pricing) · [Database-only limits](https://supabase.com/kb/faqs/platform/database-only-cost)
- Render free web services sleep after **15 minutes without inbound HTTP or WebSocket traffic**, then cold-start on a request. Free instance hours, bandwidth, resources, and other limits apply. Its local filesystem is ephemeral; production data must stay in Supabase. [Render free services](https://render.com/docs/free) · [WebSocket support](https://render.com/docs/websocket)
- WebRTC mesh sends media directly between participants. Upload bandwidth and CPU grow with the number of peers; this implementation caps a room at **six connections**. Larger calls need an SFU such as LiveKit/mediasoup and additional infrastructure. TURN relays consume hosting and bandwidth and may cost money. Screen sharing uses the outgoing video track in place of the camera, rather than a separate simultaneous camera tile.
- A custom domain, transactional email, always-on server, backups, monitoring, storage growth, and TURN bandwidth can add costs. No payment or provider subscription was configured by this project.

Pricing sources checked November 15, 2026. Providers can change quotas and pricing.

## Validation and remaining production work

```powershell
npm test
npm run build
```

The Node integration suite starts a real isolated API + Socket.IO server and tests separate registration/login, hashed passwords, CSRF/origin checks, private-server invites, membership isolation, announcements, realtime delivery, edits/replies/reactions/search, private uploads, friend requests, private groups, authorized voice signaling, custom roles, blocking, bans, admin denial, session revocation, and disk persistence. It uses disposable synthetic accounts and cleans its own temporary directory.

TypeScript and Vite production build are checked. Responsive views have been inspected in a browser. Live Supabase SQL/OAuth, real multi-device camera/microphone media, NAT/TURN traversal, and a production Node deployment still require your configured infrastructure and a real-device test. Signaling tests are not a media-quality test.

This is a small-community implementation, not a tested Discord-scale service. The repository adapter pages Supabase results, but some operations still scan/hydrate multiple records. Add query-specific pagination and transactional multi-record operations before large deployments. Horizontal scaling needs a Socket.IO Redis adapter, shared rate limits and distributed presence/voice coordination. Multi-step writes currently are not atomic across tables. Production launch should also add password recovery/account deletion, email abuse controls, malware scanning, robust monitoring, backup/restore testing, and full Tamil localization. Native OS game detection is not available to ordinary web pages; gaming status is manually entered.

## Source map

| File                        | Purpose                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `src/AuthPage.tsx`          | Account-first registration/login screen                                       |
| `src/App.tsx`               | Community, messaging, discovery, friends, profile, settings and moderation UI |
| `src/Call.tsx`              | Mesh WebRTC calls, camera/screen tracks, activity and controls                |
| `src/styles.css`            | Responsive original design, three themes, animations                          |
| `src/api.ts`                | Credentialed API client; no secrets                                           |
| `server/index.js`           | Express API, authentication, uploads, Socket.IO, signaling                    |
| `server/policy.js`          | Membership, role and blocking checks                                          |
| `server/store.js`           | Supabase and local persistence adapters                                       |
| `supabase/schema.sql`       | Database tables, indexes, access controls, private storage bucket             |
| `tests/integration.test.js` | Real API / Socket.IO security and functionality tests                         |
| `.env.example`              | Server configuration template                                                 |
| `render.yaml`               | Free-tier Node deployment blueprint                                           |

See `API.md` for endpoints. Source is MIT licensed; dependencies retain their own open-source licenses.

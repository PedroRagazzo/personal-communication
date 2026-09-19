# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

TORA DOS BURRO is a Discord-style real-time communication platform: servers/channels, roles/permissions, real-time chat, voice/video/screen-share over WebRTC, and Go Live (via LiveKit). Backend (Elixir/Phoenix): MVP (FASES 0-8) plus FASE 9 (Go Live) complete. Desktop client (React + Electron, `desktop/`): FASE 11 is in progress and already has working auth, server/channel navigation, real-time chat, voice (real mesh WebRTC), and screen share — video (camera) and Go Live aren't wired up in the client yet. Rust/C++/Python media services are planned for later and don't exist yet beyond empty placeholder directories (`rust/`, `cpp/`, `python/`).

Read `README.md` first for current phase status, then `docs/*.md` (`architecture`, `database`, `api`, `realtime`, `media`, `security`, `roadmap`) — these are living design docs kept in sync with what's actually implemented, with explicit "Implementado" / "Ainda não implementado" notes where a feature is server-side-only so far.

## Development process — read before making changes

This repo follows a strict, user-mandated phased process (`docs/roadmap.md`), not ad hoc feature work:

1. Work proceeds one numbered FASE at a time, in the order listed in `docs/roadmap.md` — don't jump ahead or bundle multiple phases into one change.
2. **Before implementing anything, explain first**: objective, architecture, files involved, dependencies, data flow. Implement only after that's been laid out.
3. After implementing: add tests, then explain how to run and how to test it.
4. Don't invent APIs or libraries; verify real version compatibility (e.g. via `mix hex.info`) before adding any dependency, and justify why it's needed.
5. No premature microservices — Rust/C++/Python only get introduced when a phase has a concrete, measured need (see `docs/architecture.md` for the "why not TypeScript, why not Rust" justification bar).
6. Control Plane / Media Plane / Data Plane stay strictly separated (see Architecture below).

This project has consistently been built feature-by-feature with tests and a live/manual check at each step, not in large bulk changes — keep following that pattern rather than batching work across phases.

## Commands

Run from `backend/`:

```bash
mix setup                                    # deps.get + ecto.setup (create, migrate, seed)
mix phx.server                               # http://localhost:4000, health check GET /api/v1/health
mix test                                     # ecto.create/migrate (quiet) + test
mix test test/path/to/some_test.exs:LINE     # single test
mix test --failed                            # re-run only last failures
mix precommit                                # compile --warnings-as-errors, deps.unlock --unused, format, test — run before calling a change done
mix ecto.reset                               # drop + recreate + migrate + seed
```

Run from `desktop/` (needs the backend already running — see above):

```bash
npm install
npm run dev          # electron-vite dev — opens a real Electron window
npm run typecheck    # tsc --noEmit, separately for main/preload (Node) and renderer (DOM)
npm run build         # typecheck + electron-vite build -> desktop/out/
```

**Windows**: `argon2_elixir` compiles a native NIF and needs MSVC Build Tools (`Desktop development with C++` workload) on `PATH`. If a fresh shell fails on `mix compile`/`test`/`phx.server` with `"nmake" not found`, load the MSVC environment first:

```powershell
cmd /c '"C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64 && set' | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }
```

Local infra (Postgres/Redis/coturn/MinIO/LiveKit) is `docker compose up -d` from the repo root. `backend/config/{dev,test}.exs` expect a `tora`/`tora_dev_password` role reachable at `localhost:5432` either way — if running Postgres natively instead of Docker, create the role manually: `CREATE ROLE tora WITH LOGIN SUPERUSER PASSWORD 'tora_dev_password';`. LiveKit's dev config uses its own fixed `--dev` credentials (`devkey`/`secret`, already in `backend/config/dev.exs`) — prod reads `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`/`LIVEKIT_URL` instead (`backend/config/runtime.exs`).

See `backend/AGENTS.md` for generic Phoenix/Elixir/Ecto/Mix conventions (prefer `Req` over `:httpoison`/`:tesla`, changeset gotchas, test process-cleanup patterns) — those apply on top of everything below and aren't repeated here.

## Architecture

### Three planes

- **Control Plane** (`backend/lib/tora_dos_burro/` contexts + `backend/lib/tora_dos_burro_web/` controllers/channels): auth, users, servers, roles/permissions, channels, messages, presence, WebRTC *signaling only*.
- **Media Plane**: real audio/video/screen-share bytes, via WebRTC (DTLS-SRTP) — **never** touches the Phoenix WebSocket. Phoenix Channels only relay SDP offers/answers and ICE candidates as opaque JSON (or, for Go Live, just hand out a LiveKit token — no SDP/ICE relay at all, since the SFU handles that). Client-side peer connections are real for voice (audio) and screen share (`desktop/src/renderer/src/webrtc/MeshManager.ts` — see "Desktop client" below); video (camera) and the actual LiveKit connection are still server-only skeletons.
- **Data Plane**: PostgreSQL (`Ecto`/`Repo`) for durable state, `Phoenix.Presence` for all ephemeral realtime state (below), object storage (planned, MinIO/S3) for attachments.

### Contexts (`backend/lib/tora_dos_burro/`)

- `Accounts` — registration/auth. Usernames are **not** globally unique alone: identity is Discord-style `username#discriminator`, with a unique index on the pair and randomized-with-retry discriminator assignment on collision (`insert_with_discriminator/2` in `accounts.ex`).
- `Guardian` — JWT (access + refresh), backed by `guardian_db` for revocation/rotation (plain Guardian is stateless and can't revoke on its own).
- `Servers` — servers, members, roles, invites, bans; owns `effective_permissions/2` (server-level) and `authorize/3`.
- `Servers.Permissions` — the permission bitfield (`view_channels`, `send_messages`, `manage_roles`, `administrator`, etc. — see the module for the full flag list and hex values).
- `Channels` — channels, categories, `permission_overwrites`. Owns the Discord-equivalent per-channel permission resolution in `channel_permissions/3`/`authorize/3`: server base → `@everyone` overwrite → other role overwrites → member-specific overwrite → `administrator` bypasses overwrites entirely → server owner always passes regardless of role. This exact order is load-bearing.
- `Chat` — messages, reactions. Ordering/pagination uses a monotonic `seq` (bigserial) column, **not** `inserted_at`/id — timestamps aren't a reliable order key here (UUID PKs aren't sortable, and OS clock resolution, observed concretely on Windows, isn't fine-grained enough to break same-millisecond ties). Don't revert this to timestamp-based ordering.
- `GoLive` — issues LiveKit access tokens (`GoLive.LiveKitToken`, hand-rolled JWT via `joken`, not the stale/partial third-party `livekit` hex package). No Room Service API calls — a LiveKit room auto-creates on first authenticated join. `start_stream/2` (needs `:stream`, publisher token) and `watch_stream/2` (needs `:connect`, subscriber-only token) both delegate to `Channels.authorize/3` — same permission machinery as everything else, nothing new.

### Realtime (`backend/lib/tora_dos_burro_web/channels/`)

- `UserSocket` authenticates via a Guardian token passed as a **connect param** (`?token=`), not a header — browsers can't set custom headers on the WS handshake.
- `ChatChannel` (topic `channel:{id}`) — text chat: `message:create/update/delete/reaction`, `typing:start/stop`. Mutations happen over the socket, not REST; REST only covers CRUD-ish resources and history pagination (`docs/api.md`).
- `VoiceChannel` (topic `voice:{id}`) — voice/video/screen-share signaling: `sdp:offer`/`sdp:answer`/`ice:candidate` relay (broadcast + client-side `to`/`from` filtering — mesh topology, fine at small scale), `state:update` (mute/deafen), `video:enable/disable`, `screen_share:start/stop`. Limits are server-enforced, never client-trusted: max 4 concurrent video participants per channel, max 1 active screen share per channel.
- `GoLiveChannel` (topic `live:{id}`, FASE 9) — Go Live via LiveKit (SFU), channel must be `guild_voice`. `join` returns a subscriber-only token; `golive:start` elevates to a publisher token (checked at that point, not just at join — same pattern as `video:enable`); `golive:stop` reverts. Deliberately **no** cap on simultaneous streamers per room, unlike FASE 8's screen-share — that limit exists because of mesh fan-out cost, which doesn't apply once an SFU is involved, so don't add one here without a real reason.
- `ToraDosBurroWeb.Presence` backs **all** ephemeral state (who's in a voice room, muted/deafened/video/screen-share/live flags) — deliberately never persisted to Postgres; it's session state, not history.
- Every `join/3` re-authenticates (Guardian) and re-authorizes (roles + `permission_overwrites`) — never trust a client-asserted permission.

### IDs

Every table uses `binary_id` (UUID) primary keys.

## Desktop client (`desktop/`)

React + Electron + TypeScript, built with `electron-vite` (three build targets, one config block each in `electron.vite.config.ts`):

- `src/main/` — the only place with real Node/Electron access: window creation, secure token storage (`safeStorage`, IPC handlers `secure-storage:*`), permission gating (`session.setPermissionCheckHandler`/`setPermissionRequestHandler` — only `'media'`/`'display-capture'` allowed, everything else denied by default), screen-share source listing (`desktopCapturer`) and `setDisplayMediaRequestHandler`.
- `src/preload/` — thin `contextBridge` bridge (`window.api.{secureStorage,screenShare}`), nothing else. **Must build as CommonJS** (`output: { format: 'cjs' }`, set in its `electron.vite.config.ts` block) — `sandbox: true` (in `main/index.ts`'s `webPreferences`, deliberately never turned off) flatly refuses an ESM preload with `SyntaxError: Cannot use import statement outside a module`, and it fails *silently in the window's own console*, not the terminal — this went unnoticed through several phases because every earlier check ran the renderer's Vite dev server in a plain browser tab (no preload there either way, so a missing `window.api` looked "expected"). If `window.api` is ever undefined inside the real app, check the preload's output format first.
- `src/renderer/` — the React app (`src/renderer/src/`), Tailwind v4 (`@tailwindcss/vite`), Vite dev server on port 5173 in dev.

State (Zustand, `src/renderer/src/stores/`):

- `authStore` — tokens + current user; persists via `window.api.secureStorage` (never `localStorage`); owns the socket lifecycle (`connectSocket`/`disconnectSocket`, `services/socket.ts`) and resets every other store on logout.
- `serversStore` — server/channel list + server members. Members are fetched once per server-select, **not** live-updated — someone who joins after that fetch shows as "desconhecido" in chat/voice until the server is reselected.
- `chatStore` — joins/leaves the selected text channel's `channel:{id}` topic, holds its messages.
- `voiceStore` — joins/leaves `voice:{id}`, owns the `MeshManager` (below), mic mute, screen-share start/stop.

`services/socket.ts` holds one `phoenix` (npm package, same version as the backend's Phoenix) `Socket` per authenticated session. `webrtc/MeshManager.ts` is the WebRTC mesh: one `RTCPeerConnection` per participant, **perfect negotiation** (polite/impolite by comparing `user_id` strings — both sides compute the same comparison, so they always agree on who's who) so simultaneous offers don't corrupt signaling state, plus a queue for ICE candidates that arrive before `setRemoteDescription` resolves. Screen share reuses the *same* peer connections (`setScreenTrack` adds/removes a video track, `onnegotiationneeded` renegotiates) — it is not a second mesh. Every signaling event carries `to`/`from`; the client must filter on `to === currentUserId` since the server broadcasts to the whole topic, not just the addressee.

Screen-share source picking has no native picker on Windows (Electron's `useSystemPicker` is macOS-15+-only), so `components/ScreenSharePicker.tsx` is hand-built from `desktopCapturer.getSources()` thumbnails: user picks a source → renderer tells `main` which one via `window.api.screenShare.selectSource(id)` → renderer calls `getDisplayMedia()`, which triggers `setDisplayMediaRequestHandler`, already primed to resolve with that source. The server-side exclusivity claim (`screen_share:start`) happens *after* the user already picked a source, not before, so losing the race doesn't waste a picker interaction.

## Testing

- Backend: ExUnit + `Phoenix.ConnTest`/`ChannelTest`, via the support cases in `backend/test/support/`: `ConnCase`, `DataCase`, `ChannelCase`.
  - A Channel test that closes a socket with `close/1` must set `Process.flag(:trap_exit, true)` first — the channel process is linked to the test process, and without trapping exits the test crashes instead of asserting on the resulting `presence_diff`.
- Desktop client: `npm run typecheck` only — no automated test suite exists yet for `desktop/`. Real-app verification has been manual but thorough (see below).
- Convention so far has been to verify realtime/media features against the real running app, not static checks alone: a real WebSocket client (Node + the actual `phoenix` npm package) for backend-only phases; for client phases, driving the actual renderer via dynamic `import()` of the store modules plus a forced auth state, which works from any Chromium context *including* the plain browser pane.
- **`window.api` (secureStorage, screenShare, anything preload-provided) only exists inside the real Electron window — never in a plain browser tab.** To reach the real Electron window's own console for verification: launch with `electron-vite dev --remoteDebuggingPort <port>`, then drive it over the Chrome DevTools Protocol (`Runtime.evaluate` against the target's `webSocketDebuggerUrl` from `http://localhost:<port>/json/list`; Node's built-in `WebSocket` global is enough, no extra dependency needed). This is how the sandboxed-preload-needs-CJS bug (see "Desktop client" above) was actually found — it was invisible from outside a real Electron window.

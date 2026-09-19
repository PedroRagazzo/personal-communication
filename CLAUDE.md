# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

TORA DOS BURRO is a Discord-style real-time communication platform: servers/channels, roles/permissions, real-time chat, voice/video/screen-share over WebRTC, and (planned) Go Live. The backend (Elixir/Phoenix) is the only part implemented so far — MVP backend (FASES 0-8) is complete. A React+Electron desktop client, then Rust/C++/Python media services, are planned for later phases and don't exist yet beyond empty placeholder directories (`desktop/`, `rust/`, `cpp/`, `python/`).

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

**Windows**: `argon2_elixir` compiles a native NIF and needs MSVC Build Tools (`Desktop development with C++` workload) on `PATH`. If a fresh shell fails on `mix compile`/`test`/`phx.server` with `"nmake" not found`, load the MSVC environment first:

```powershell
cmd /c '"C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64 && set' | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }
```

Local infra (Postgres/Redis/coturn/MinIO) is `docker compose up -d` from the repo root. `backend/config/{dev,test}.exs` expect a `tora`/`tora_dev_password` role reachable at `localhost:5432` either way — if running Postgres natively instead of Docker, create the role manually: `CREATE ROLE tora WITH LOGIN SUPERUSER PASSWORD 'tora_dev_password';`.

See `backend/AGENTS.md` for generic Phoenix/Elixir/Ecto/Mix conventions (prefer `Req` over `:httpoison`/`:tesla`, changeset gotchas, test process-cleanup patterns) — those apply on top of everything below and aren't repeated here.

## Architecture

### Three planes

- **Control Plane** (`backend/lib/tora_dos_burro/` contexts + `backend/lib/tora_dos_burro_web/` controllers/channels): auth, users, servers, roles/permissions, channels, messages, presence, WebRTC *signaling only*.
- **Media Plane**: real audio/video/screen-share bytes, via WebRTC (DTLS-SRTP) — **never** touches the Phoenix WebSocket. Phoenix Channels only relay SDP offers/answers and ICE candidates as opaque JSON; the actual peer connections are client-side and don't exist yet (they land with the Electron client in a later phase), so the voice/video/screen-share Channel code is currently a signaling/authorization/Presence skeleton with nothing driving it end-to-end.
- **Data Plane**: PostgreSQL (`Ecto`/`Repo`) for durable state, `Phoenix.Presence` for all ephemeral realtime state (below), object storage (planned, MinIO/S3) for attachments.

### Contexts (`backend/lib/tora_dos_burro/`)

- `Accounts` — registration/auth. Usernames are **not** globally unique alone: identity is Discord-style `username#discriminator`, with a unique index on the pair and randomized-with-retry discriminator assignment on collision (`insert_with_discriminator/2` in `accounts.ex`).
- `Guardian` — JWT (access + refresh), backed by `guardian_db` for revocation/rotation (plain Guardian is stateless and can't revoke on its own).
- `Servers` — servers, members, roles, invites, bans; owns `effective_permissions/2` (server-level) and `authorize/3`.
- `Servers.Permissions` — the permission bitfield (`view_channels`, `send_messages`, `manage_roles`, `administrator`, etc. — see the module for the full flag list and hex values).
- `Channels` — channels, categories, `permission_overwrites`. Owns the Discord-equivalent per-channel permission resolution in `channel_permissions/3`/`authorize/3`: server base → `@everyone` overwrite → other role overwrites → member-specific overwrite → `administrator` bypasses overwrites entirely → server owner always passes regardless of role. This exact order is load-bearing.
- `Chat` — messages, reactions. Ordering/pagination uses a monotonic `seq` (bigserial) column, **not** `inserted_at`/id — timestamps aren't a reliable order key here (UUID PKs aren't sortable, and OS clock resolution, observed concretely on Windows, isn't fine-grained enough to break same-millisecond ties). Don't revert this to timestamp-based ordering.

### Realtime (`backend/lib/tora_dos_burro_web/channels/`)

- `UserSocket` authenticates via a Guardian token passed as a **connect param** (`?token=`), not a header — browsers can't set custom headers on the WS handshake.
- `ChatChannel` (topic `channel:{id}`) — text chat: `message:create/update/delete/reaction`, `typing:start/stop`. Mutations happen over the socket, not REST; REST only covers CRUD-ish resources and history pagination (`docs/api.md`).
- `VoiceChannel` (topic `voice:{id}`) — voice/video/screen-share signaling: `sdp:offer`/`sdp:answer`/`ice:candidate` relay (broadcast + client-side `to`/`from` filtering — mesh topology, fine at small scale), `state:update` (mute/deafen), `video:enable/disable`, `screen_share:start/stop`. Limits are server-enforced, never client-trusted: max 4 concurrent video participants per channel, max 1 active screen share per channel.
- `ToraDosBurroWeb.Presence` backs **all** ephemeral state (who's in a voice room, muted/deafened/video/screen-share flags) — deliberately never persisted to Postgres; it's session state, not history.
- Every `join/3` re-authenticates (Guardian) and re-authorizes (roles + `permission_overwrites`) — never trust a client-asserted permission.

### IDs

Every table uses `binary_id` (UUID) primary keys.

## Testing

- ExUnit + `Phoenix.ConnTest`/`ChannelTest`, via the support cases in `backend/test/support/`: `ConnCase`, `DataCase`, `ChannelCase`.
- A Channel test that closes a socket with `close/1` must set `Process.flag(:trap_exit, true)` first — the channel process is linked to the test process, and without trapping exits the test crashes instead of asserting on the resulting `presence_diff`.
- Convention so far has been to verify each realtime phase two ways: the ExUnit suite, *and* a real WebSocket client (Node + the actual `phoenix` npm package) driven against a locally running `mix phx.server` — Channel/Presence behavior over an actual socket has caught things the automated suite alone didn't.

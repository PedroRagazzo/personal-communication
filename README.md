# TORA DOS BURRO

Plataforma de comunicação em tempo real (estilo Discord): servidores/comunidades, canais de texto e voz, chat em tempo real, mensagens diretas, voz e vídeo via WebRTC, **compartilhamento de tela**, Go Live e upload de arquivos — com backend em Elixir/Phoenix, cliente desktop em React + Electron, e Rust/C++/Python entrando depois do MVP conforme necessidade real de performance.

## Status atual

**MVP (backend) concluído — FASES 0 a 8 — mais a FASE 9 (Go Live) como fast-follow, todas verificadas de ponta a ponta.** 80 testes passando (`cd backend && mix test`).

| Fase | O quê | Release |
|---|---|---|
| 0 | Arquitetura | — |
| 1 | Backend básico (health check) | `v0.1.0` |
| 2 | Autenticação (Guardian + guardian_db, argon2id) | `v0.2.0` |
| 3 | Usuários e servidores (cargos, permissões, convites, bans) | `v0.3.0` |
| 4 | Chat em tempo real (núcleo — anexos leves pendentes) | `v0.4.0-core` |
| 5 | Categorias e permissões por canal (`permission_overwrites`) | `v0.5.0` |
| 6 | Voz — sinalização (relay SDP/ICE + Presence) | `v0.6.0` |
| 7 | Vídeo (cap de 4 participantes por sala) | `v0.7.0` |
| 8 | Compartilhamento de tela (1 por sala) | `v0.8.0` |
| 9 | Go Live — sinalização (tokens LiveKit + Presence, SFU: LiveKit) | `v0.9.0` |
| 11 | Cliente Electron — fatia 1: scaffold + autenticação | `v0.10.0` |
| 11 | Cliente Electron — fatia 2: lista de servidores/canais | `v0.11.0` |
| 11 | Cliente Electron — fatia 3: chat em tempo real | `v0.12.0` |
| 11 | Cliente Electron — fatia 4: voz (mesh WebRTC) | `v0.13.0` |

**FASE 11 está em andamento, dividida em fatias** (é grande demais pra uma entrega só — ver `docs/roadmap.md`). Fatia 1: app Electron real (main/preload/renderer isolados), cadastro/login contra o backend, tokens guardados via `safeStorage` (keychain do SO). Fatia 2: navegação entre servidores e canais (só leitura — trouxe também o `GET /api/v1/servers` que faltava no backend). Fatia 3: chat de texto de verdade — histórico via REST, conectado ao socket (`phoenix` client), mensagens novas chegam ao vivo pra todo mundo no canal. Fatia 4: voz de verdade — mesh WebRTC com perfect negotiation, microfone real, mute (ver `docs/media.md`). Ainda faltam: vídeo, compartilhamento de tela, deafen, presença de mensagem, editar/apagar/reagir mensagem, criar servidor/canal, Go Live no cliente, empacotamento.

**O qualificador "(backend)" nas FASES 6–9 quase não importa mais.** Chat (FASE 4) e voz (FASE 6, só áudio) já funcionam de ponta a ponta no cliente, com peer connections WebRTC de verdade e perfect negotiation. Ainda faltam no cliente: vídeo (FASE 7), compartilhamento de tela (FASE 8, precisa do `desktopCapturer` do Electron) e a conexão real com o LiveKit (FASE 9, Go Live) — mas a base de peer connections que vídeo/tela vão reaproveitar já está pronta e testada.

**Pendente antes de um MVP completo de ponta a ponta**: anexos leves (FASE 4 — precisa de Docker/MinIO rodando), Amigos/DM (fast-follow fora do MVP formal, schema já pronto), e a própria FASE 11. Confirmação de email e recuperação de senha ficam para uma fatia futura da FASE 2 (dependem de escolher um mailer). LiveKit em si também precisa de Docker para rodar localmente — não verificável neste ambiente, mesma limitação do MinIO.

Leia primeiro:

- [`docs/architecture.md`](docs/architecture.md) — visão geral, escopo do MVP, arquitetura geral, responsabilidade de cada linguagem
- [`docs/database.md`](docs/database.md) — modelo de dados inicial
- [`docs/api.md`](docs/api.md) — superfície de API (REST + WebSocket)
- [`docs/realtime.md`](docs/realtime.md) — Phoenix Channels, eventos, presença
- [`docs/media.md`](docs/media.md) — WebRTC: voz, vídeo, compartilhamento de tela, Go Live
- [`docs/security.md`](docs/security.md) — estratégia de segurança
- [`docs/roadmap.md`](docs/roadmap.md) — roadmap completo por fases (0–18)

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Núcleo / Control Plane | Elixir, Phoenix, Ecto, PostgreSQL, OTP |
| Mídia / Media Plane | WebRTC (mesh no MVP, SFU depois), coturn (TURN) |
| Cliente desktop | React, TypeScript, Electron |
| Dados / Data Plane | PostgreSQL, Redis, Object Storage (MinIO local / S3-compatível em produção) |
| Performance (pós-MVP) | Rust (mídia, SDK), C++ (DSP de áudio/vídeo, via Rust) |
| Dados / ML (pós-MVP) | Python (analytics, moderação automática) |

Ver [`docs/architecture.md`](docs/architecture.md) para o raciocínio completo por trás de cada escolha.

## Estrutura do repositório

```
backend/    Elixir/Phoenix (FASE 1+)
desktop/    React + Electron + TypeScript (FASE 11+)
rust/       Serviços de mídia/SDK em Rust (FASE 12+)
cpp/        Media engine nativo (FASE 13+)
python/     Analytics/ML/moderação (FASE 14+)
docs/       Documentação técnica (este é o conteúdo vivo agora)
docker/     Configuração de infraestrutura local
```

## Rodando a infraestrutura local

Via Docker (caminho documentado, dá Postgres + Redis + coturn + MinIO de uma vez — o usuário `tora` já vem criado pela imagem oficial do Postgres):

```bash
docker compose up -d
```

Alternativa sem Docker (só Postgres, usada durante o desenvolvimento da FASE 1): instale o PostgreSQL 17 localmente e crie o role manualmente:

```sql
CREATE ROLE tora WITH LOGIN SUPERUSER PASSWORD 'tora_dev_password';
```

## Rodando o backend

```bash
cd backend
mix deps.get
mix ecto.create
mix phx.server
```

Servidor em `http://localhost:4000`. Health check: `http://localhost:4000/api/v1/health`.

```bash
cd backend
mix test
```

**Windows:** o `argon2_elixir` compila uma extensão nativa e precisa do MSVC
(Visual Studio Build Tools, workload "Desktop development with C++"). Se um
terminal novo der erro `"nmake" not found`, carregue o ambiente do MSVC antes
de rodar `mix`:

```powershell
cmd /c '"C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat" x64 && set' | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process') } }
```

## Rodando o cliente desktop

Precisa do backend rodando (`mix phx.server`, acima) — o cliente fala com ele via `http://localhost:4000`.

```bash
cd desktop
npm install
npm run dev
```

Abre o app Electron de verdade (não só uma aba de navegador), com hot-reload. `npm run build` gera o bundle de produção em `desktop/out/` (empacotamento/instalador ainda não existe — fica para uma fatia futura da FASE 11). `npm run typecheck` roda o `tsc --noEmit` separado para `main`/`preload` (Node) e `renderer` (DOM).

## Próximos passos

FASE 11 (Electron) está em andamento — próxima fatia natural é vídeo (câmera, reaproveitando o mesh já pronto) ou compartilhamento de tela, depois criar servidor/canal no cliente e Go Live. Outras direções em aberto, a decidir com quem está lendo isto:

- **Anexos leves** (fecha a FASE 4, precisa de `docker compose up -d`)
- **Amigos/DM** (fast-follow, schema já pronto desde a FASE 3/4)
- Ou seguir a ordem original: FASE 10 (arquivos, hardening), 12–18

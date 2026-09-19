# TORA DOS BURRO

Plataforma de comunicação em tempo real (estilo Discord): servidores/comunidades, canais de texto e voz, chat em tempo real, mensagens diretas, voz e vídeo via WebRTC, **compartilhamento de tela**, Go Live e upload de arquivos — com backend em Elixir/Phoenix, cliente desktop em React + Electron, e Rust/C++/Python entrando depois do MVP conforme necessidade real de performance.

## Status atual

**FASE 0 — Arquitetura: concluída.** **FASE 1 — Backend básico: concluída e verificada** — `mix phx.server` sobe, `GET /api/v1/health` responde `200 {"status":"ok"}`, `mix test` passa (3/3).

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

## Próximos passos

**FASE 2 — Autenticação** (registro, login, Guardian JWT, `guardian_db`, argon2id).

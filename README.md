# TORA DOS BURRO

Plataforma de comunicação em tempo real (estilo Discord): servidores/comunidades, canais de texto e voz, chat em tempo real, mensagens diretas, voz e vídeo via WebRTC, **compartilhamento de tela**, Go Live e upload de arquivos — com backend em Elixir/Phoenix, cliente desktop em React + Electron, e Rust/C++/Python entrando depois do MVP conforme necessidade real de performance.

## Status atual

**MVP (backend) concluído — FASES 0 a 8, todas verificadas de ponta a ponta.** 68 testes passando (`cd backend && mix test`).

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

**O qualificador "(backend)" importa.** FASES 6–8 implementaram toda a sinalização/autorização/Presence do lado do servidor para voz, vídeo e tela — mas as peer connections WebRTC de verdade, perfect negotiation, STUN/coturn e `desktopCapturer` são client-side e só chegam com o Electron (FASE 11). Sem um cliente de verdade ainda, ninguém liga microfone/câmera/tela — só o "esqueleto" que torna isso possível está pronto e testado.

**Pendente antes de um MVP completo de ponta a ponta**: anexos leves (FASE 4 — precisa de Docker/MinIO rodando), Amigos/DM (fast-follow fora do MVP formal, schema já pronto), e a própria FASE 11. Confirmação de email e recuperação de senha ficam para uma fatia futura da FASE 2 (dependem de escolher um mailer).

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

## Próximos passos

Fim do MVP (backend) — algumas direções possíveis, a decidir com quem está lendo isto:

- **FASE 9 — Go Live** (decisão em aberto: mediasoup vs LiveKit, ver `docs/media.md`)
- **FASE 11 — Cliente Electron** (é o que faz voz/vídeo/tela funcionarem de verdade, ligando no que já existe)
- **Anexos leves** (fecha a FASE 4, precisa de `docker compose up -d`)
- **Amigos/DM** (fast-follow, schema já pronto desde a FASE 3/4)
- Ou seguir a ordem original: FASE 10 (arquivos, hardening), 12–18

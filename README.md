# TORA DOS BURRO

Plataforma de comunicação em tempo real (estilo Discord): servidores/comunidades, canais de texto e voz, chat em tempo real, mensagens diretas, voz e vídeo via WebRTC, **compartilhamento de tela**, Go Live e upload de arquivos — com backend em Elixir/Phoenix, cliente desktop em React + Electron, e Rust/C++/Python entrando depois do MVP conforme necessidade real de performance.

## Status atual

**FASE 0 — Arquitetura: concluída.** **FASE 1 — Backend básico: concluída.** **FASE 2 — Autenticação: concluída.** **FASE 3 — Usuários e servidores: concluída.** **FASE 4 — Chat em tempo real: núcleo concluído.** **FASE 5 — Categorias e permissões por canal: concluída.** **FASE 6 — Voz (sinalização): concluída.** **FASE 7 — Vídeo: concluída** — `video:enable`/`video:disable` no mesmo `VoiceChannel`, cap de 4 participantes com vídeo por sala aplicado no servidor. 64 testes passando, verificado ao vivo.

**O que ainda não está coberto, de propósito**: as peer connections WebRTC de verdade (perfect negotiation, STUN/coturn) são client-side e só chegam com o Electron na FASE 11 — até lá, o Phoenix só faz sinalização, nunca vê mídia. Anexos leves (upload via MinIO) ficam pendentes — dependem do Docker/MinIO estarem rodando (ver `docker-compose.yml`), o que este ambiente ainda não tem. Confirmação de email e recuperação de senha ficam para uma fatia futura da FASE 2 (dependem de escolher um mailer).

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

**FASE 8 — Compartilhamento de tela** (`desktopCapturer`, 1 compartilhamento ativo por vez por canal — mesma sinalização das FASES 6/7). Anexos leves da FASE 4 continuam pendentes, precisando de `docker compose up -d` para verificar de ponta a ponta.

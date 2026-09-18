# TORA DOS BURRO

Plataforma de comunicação em tempo real (estilo Discord): servidores/comunidades, canais de texto e voz, chat em tempo real, mensagens diretas, voz e vídeo via WebRTC, **compartilhamento de tela**, Go Live e upload de arquivos — com backend em Elixir/Phoenix, cliente desktop em React + Electron, e Rust/C++/Python entrando depois do MVP conforme necessidade real de performance.

## Status atual

**FASE 0 — Arquitetura: concluída.** Este repositório contém o planejamento técnico completo e o esqueleto de diretórios. **Nenhum código de aplicação foi escrito ainda** — a FASE 1 (backend Elixir funcional) só começa após confirmação explícita, conforme a regra do projeto de "não avançar fase sem a anterior estar funcional".

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

Ainda não há aplicação para rodar (isso começa na FASE 1), mas a infraestrutura de apoio já pode subir:

```bash
docker compose up -d
```

Isso sobe PostgreSQL, Redis, coturn (TURN/STUN) e MinIO (object storage compatível com S3) para desenvolvimento local. Ver [`docker-compose.yml`](docker-compose.yml).

## Próximos passos

Aguardando confirmação para iniciar a **FASE 1 — Backend Elixir** (`mix phx.new`, configuração de ambiente, health check).

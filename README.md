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
| 8 | Compartilhamento de tela | `v0.8.0` |
| 9 | Go Live — sinalização (tokens LiveKit + Presence, SFU: LiveKit) | `v0.9.0` |
| 11 | Cliente Electron — fatia 1: scaffold + autenticação | `v0.10.0` |
| 11 | Cliente Electron — fatia 2: lista de servidores/canais | `v0.11.0` |
| 11 | Cliente Electron — fatia 3: chat em tempo real | `v0.12.0` |
| 11 | Cliente Electron — fatia 4: voz (mesh WebRTC) | `v0.13.0` |
| 11 | Cliente Electron — fatia 5: compartilhamento de tela | `v0.14.0` |
| — | Autenticação simplificada no cliente (cadastro só usuário+senha; login por `username#discriminator`) | `v0.14.1` |
| 11 | Cliente Electron — fatia 6: vídeo/câmera | `v0.15.0` |
| — | Compartilhamento de tela sem limite de simultâneos (revisão de escopo) | `v0.15.1` |
| 11 | Cliente Electron — fatia 7: deafen | `v0.15.2` |

**FASE 11 está em andamento, dividida em fatias** (é grande demais pra uma entrega só — ver `docs/roadmap.md`). Fatia 1: app Electron real (main/preload/renderer isolados), cadastro/login contra o backend, tokens guardados via `safeStorage` (keychain do SO). Fatia 2: navegação entre servidores e canais (só leitura — trouxe também o `GET /api/v1/servers` que faltava no backend). Fatia 3: chat de texto de verdade — histórico via REST, conectado ao socket (`phoenix` client), mensagens novas chegam ao vivo pra todo mundo no canal. Fatia 4: voz de verdade — mesh WebRTC com perfect negotiation, microfone real, mute. Fatia 5: compartilhamento de tela de verdade — `desktopCapturer` + picker próprio (sem picker nativo no Windows), mesma malha de peer connections da voz (ver `docs/media.md`). Entre a 5 e a 6, a pedido do usuário: cadastro passou a pedir só usuário+senha (sem email), login virou o caminho raro de recuperação (`username#discriminator`+senha) já que a sessão persiste sozinha depois do primeiro login. Fatia 6: vídeo/câmera de verdade — liga/desliga câmera, reaproveita a mesma malha de peer connections da voz/tela, dá pra ter câmera e tela ativas ao mesmo tempo. Logo depois da fatia 6, o usuário definiu o escopo real de deploy — **um único servidor, uso privado por ~20 pessoas, nunca público** — e por isso o limite de 1 compartilhamento de tela por vez (FASE 8) foi removido (cap de vídeo por câmera, 4 simultâneos, continua valendo) e **Amigos/DM, gestão avançada de arquivos (FASE 10) e "criar servidor" saem do que está planejado** — sem sentido pra um servidor único e privado. Fatia 7: deafen — ensurdecer força mute junto, desmutar enquanto ensurdecido desensurdece também (igual Discord). Ainda faltam: editar/apagar/reagir mensagem, criar canal (não servidor), Go Live no cliente, empacotamento.

**Bug real achado e corrigido na fatia 5, mas presente desde a fatia 1**: o preload nunca carregava de verdade dentro do Electron (o sandbox exige CommonJS, não ESM, e o electron-vite gerava `.mjs` por padrão) — só não tinha aparecido porque toda verificação anterior rodava numa aba de navegador comum, onde a ausência de `window.api` sempre pareceu "esperada". `safeStorage`/persistência de sessão (fatia 1) só foi verificada de verdade dentro do Electron real agora, depois do fix — funciona corretamente. Detalhes em `docs/media.md` e `docs/security.md`.

**Dois bugs reais de WebRTC achados e corrigidos na fatia 6** (só reproduziam com várias tracks de vídeo trocando de estado entre dois peers de verdade — não apareceram nos testes de fatia 4/5): um sobre transceivers pré-criados colidindo com *glare* de negociação; outro, mais sutil, sobre `presence.onLeave` derrubando peer connections ativas por causa de uma corrida assíncrona no `Phoenix.Presence.handle_diff/2` do próprio Phoenix. Causa raiz completa de cada um em `docs/media.md`.

**O qualificador "(backend)" nas FASES 6–8 não importa mais.** Chat (FASE 4), voz (FASE 6), vídeo (FASE 7) e compartilhamento de tela (FASE 8) já funcionam de ponta a ponta no cliente, com peer connections WebRTC de verdade e perfect negotiation. Só falta no cliente a conexão real com o LiveKit (FASE 9, Go Live) — a base de peer connections que ela reaproveitaria já está pronta e testada.

**Pendente antes de um MVP completo de ponta a ponta**: anexos leves (FASE 4 — precisa de Docker/MinIO rodando) e a própria FASE 11 (fatias restantes). Amigos/DM e FASE 10 (arquivos avançado) saem do que está planejado — servidor único, uso privado, não fazem sentido nesse escopo (o schema de Amigos/DM segue pronto se um dia mudar). Confirmação de email e recuperação de senha ficam para uma fatia futura da FASE 2 (dependem de escolher um mailer). LiveKit em si também precisa de Docker para rodar localmente — não verificável neste ambiente, mesma limitação do MinIO.

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

FASE 11 (Electron) está em andamento — próxima fatia natural é editar/apagar/reagir mensagem, depois criar canal no cliente (não servidor — fora de escopo, ver `docs/roadmap.md`) e Go Live. Amigos/DM e FASE 10 (arquivos avançado) saem do planejado — servidor único, uso privado por ~20 pessoas, nunca público. Ainda em aberto:

- **Anexos leves** (fecha a FASE 4, precisa de `docker compose up -d`)
- Empacotamento/distribuição do cliente Electron

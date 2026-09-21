# TORA DOS BURRO

Plataforma de comunicação em tempo real (estilo Discord): servidores/comunidades, canais de texto e voz, chat em tempo real, mensagens diretas, voz e vídeo via WebRTC, **compartilhamento de tela**, Go Live e upload de arquivos — com backend em Elixir/Phoenix, cliente desktop em React + Electron, e Rust/C++/Python entrando depois do MVP conforme necessidade real de performance.

## Download

**[TORA DOS BURRO v1.0.5 (Windows)](https://github.com/PedroRagazzo/tora-dos-burro/releases/tag/v1.0.5)** — instalador `.exe`, não precisa de admin. O Windows vai avisar "editor desconhecido" (SmartScreen) na primeira execução — esperado, o instalador não é assinado; "Mais informações" → "Executar assim mesmo". Depois de instalar, é só criar a conta (usuário + senha) — já entra direto, sem precisar logar de novo e sem precisar de convite: toda conta nova já cai automaticamente no servidor "TORA DOS BURRO", com voz/vídeo/tela funcionando de verdade. (v1.0.0 apontava pro backend local por engano; v1.0.1 exigia `usuário#0001` pra logar e convite pra entrar no servidor; v1.0.2 tinha voz/chat em tempo real travando em "Conectando…" contra produção; v1.0.3 corrigiu isso mas ainda com a cara de clone de Discord — v1.0.4 tem identidade visual própria, ver `docs/roadmap.md`.)

O backend roda numa VPS real (`http://2.28.229.48`, sem domínio ainda — ver `docs/roadmap.md`), não é mais só local.

## Status atual

**MVP (backend) concluído — FASES 0 a 8 — mais a FASE 9 (Go Live) como fast-follow, todas verificadas de ponta a ponta.** 86 testes passando (`cd backend && mix test`). **FASE 11 (cliente Electron) também concluída** (`v0.17.0`) — chat, voz, vídeo, compartilhamento de tela, Go Live, entrar em servidor via convite e empacotamento/instalador, todos com o lado do cliente implementado e testado ao vivo.

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
| 11 | Cliente Electron — fatia 8: editar/apagar/reagir mensagem | `v0.15.3` |
| 11 | Cliente Electron — fatia 9: criar canal | `v0.15.4` |
| 11 | Cliente Electron — fatia 10: Go Live | `v0.15.5` |
| 11 | Cliente Electron — fatia 11: empacotamento/distribuição (FASE 11 concluída) | `v0.16.0` |
| 11 | Cliente Electron — fatia 12: entrar em servidor via convite | `v0.17.0` |

**FASE 11 está em andamento, dividida em fatias** (é grande demais pra uma entrega só — ver `docs/roadmap.md`). Fatia 1: app Electron real (main/preload/renderer isolados), cadastro/login contra o backend, tokens guardados via `safeStorage` (keychain do SO). Fatia 2: navegação entre servidores e canais (só leitura — trouxe também o `GET /api/v1/servers` que faltava no backend). Fatia 3: chat de texto de verdade — histórico via REST, conectado ao socket (`phoenix` client), mensagens novas chegam ao vivo pra todo mundo no canal. Fatia 4: voz de verdade — mesh WebRTC com perfect negotiation, microfone real, mute. Fatia 5: compartilhamento de tela de verdade — `desktopCapturer` + picker próprio (sem picker nativo no Windows), mesma malha de peer connections da voz (ver `docs/media.md`). Entre a 5 e a 6, a pedido do usuário: cadastro passou a pedir só usuário+senha (sem email), login virou o caminho raro de recuperação (`username#discriminator`+senha) já que a sessão persiste sozinha depois do primeiro login. Fatia 6: vídeo/câmera de verdade — liga/desliga câmera, reaproveita a mesma malha de peer connections da voz/tela, dá pra ter câmera e tela ativas ao mesmo tempo. Logo depois da fatia 6, o usuário definiu o escopo real de deploy — **um único servidor, uso privado por ~20 pessoas, nunca público** — e por isso o limite de 1 compartilhamento de tela por vez (FASE 8) foi removido (cap de vídeo por câmera, 4 simultâneos, continua valendo) e **Amigos/DM, gestão avançada de arquivos (FASE 10) e "criar servidor" saem do que está planejado** — sem sentido pra um servidor único e privado. Fatia 7: deafen — ensurdecer força mute junto, desmutar enquanto ensurdecido desensurdece também (igual Discord). Fatia 8: editar/apagar/reagir mensagem de verdade — controles aparecem só na própria mensagem, reações são emojis fixos (sem picker/dependência nova) que qualquer um pode adicionar/remover, tudo ao vivo pros outros membros do canal (`docs/realtime.md`). Fatia 9: criar canal (texto ou voz) direto na lista de canais — backend não mudou (já existia desde a FASE 4/5), botão aparece pra qualquer membro mas o servidor sempre revalida `manage_channels`, mostrando erro claro pra quem não tem permissão. Fatia 10: Go Live de verdade no cliente — `goLiveStore.ts` novo, conecta ao LiveKit via SDK oficial (`livekit-client`), separado do mesh de voz (entrar no canal já conecta como espectador; "Ir ao vivo" eleva pra um token de publicador). Backend não mudou (FASE 9 já estava pronta). Fatia 11: empacotamento/distribuição — `electron-builder` gera um instalador Windows (NSIS) de verdade a partir do bundle de produção, com ícone próprio (`desktop/build/icon.ico`); **encerra a FASE 11 inteira**. Só Windows por enquanto (única plataforma usada/testável neste projeto); sem assinatura de código (precisa de certificado pago) nem auto-update (não pedido) — ver "Gerando o instalador" abaixo. Fatia 12 (não planejada, descoberta na prática): faltava um jeito de **entrar** num servidor existente — "criar servidor" sempre esteve fora de escopo, mas "entrar via convite" nunca tinha sido construído em fatia nenhuma, e só virou um problema real ao criar o servidor único de verdade pra esse deploy (ver abaixo). Backend não mudou (`GET /invites/:code`/`POST /invites/:code/join` já existiam desde a FASE 3) — botão "+" verde no `ServerSidebar` abre um modal pro código do convite, com os erros do backend (convite inválido, expirado, limite de usos, banido, já é membro) traduzidos pra mensagens claras.

**Bug real achado e corrigido na fatia 5, mas presente desde a fatia 1**: o preload nunca carregava de verdade dentro do Electron (o sandbox exige CommonJS, não ESM, e o electron-vite gerava `.mjs` por padrão) — só não tinha aparecido porque toda verificação anterior rodava numa aba de navegador comum, onde a ausência de `window.api` sempre pareceu "esperada". `safeStorage`/persistência de sessão (fatia 1) só foi verificada de verdade dentro do Electron real agora, depois do fix — funciona corretamente. Detalhes em `docs/media.md` e `docs/security.md`.

**Dois bugs reais de WebRTC achados e corrigidos na fatia 6** (só reproduziam com várias tracks de vídeo trocando de estado entre dois peers de verdade — não apareceram nos testes de fatia 4/5): um sobre transceivers pré-criados colidindo com *glare* de negociação; outro, mais sutil, sobre `presence.onLeave` derrubando peer connections ativas por causa de uma corrida assíncrona no `Phoenix.Presence.handle_diff/2` do próprio Phoenix. Causa raiz completa de cada um em `docs/media.md`.

**Bug real de CSP achado e corrigido na fatia 10 (Go Live)**: a política de segurança de conteúdo (`connect-src`) do `index.html` nunca liberava a URL do LiveKit — nenhum host, nenhum esquema — então a conexão falhava **sempre**, em qualquer ambiente, não só aqui sem Docker; só apareceu inspecionando o console de verdade dentro do Electron (evento `securitypolicyviolation`), não em `npm run typecheck`. Como a URL do LiveKit é dinâmica (vem do backend em runtime, nunca fixa no build), a correção libera por esquema (`ws:`/`wss:`/`http:`/`https:`), não por host — e precisou cobrir tanto o WebSocket quanto um preflight HTTP que o SDK do LiveKit também faz. Detalhes em `docs/media.md`.

**O qualificador "(backend)" nas FASES 6–9 não importa mais.** Chat (FASE 4), voz (FASE 6), vídeo (FASE 7), compartilhamento de tela (FASE 8) e Go Live (FASE 9) já têm o fluxo de cliente todo ligado — conexão real (mesh WebRTC ou LiveKit conforme o caso), tratamento de erro ao vivo verificado. O que falta em Go Live especificamente é só a transmissão de mídia de verdade *através* de um LiveKit rodando (publish/subscribe de tracks reais) — não verificável neste ambiente sem Docker, mesma limitação de sempre.

**Empacotamento verificado de ponta a ponta, não só a build**: o instalador gerado (`tora-dos-burro-desktop-0.1.0-setup.exe`) foi de fato executado — instala sem precisar de admin (`perMachine: false`), cria atalho e entrada em "Aplicativos" com desinstalador funcional, e o app instalado (rodando do `.asar` empacotado, não do dev server) foi testado com o mesmo método de CDP usado no resto do projeto: `window.api`/preload carrega certo dentro do pacote, cadastro contra o backend real funciona, e a sessão sobrevive a reiniciar o app de verdade — o mesmo tipo de bug de preload achado na fatia 5 (`docs/media.md`) poderia ter voltado num caminho de build diferente (arquivos dentro de um `.asar`, não soltos em disco) e não voltou.

**Pendente antes de um MVP completo de ponta a ponta**: anexos leves (FASE 4 — precisa de Docker/MinIO rodando) e verificação de mídia real do Go Live contra um LiveKit rodando (FASE 9, também precisa de Docker). Amigos/DM e FASE 10 (arquivos avançado) saem do que está planejado — servidor único, uso privado, não fazem sentido nesse escopo (o schema de Amigos/DM segue pronto se um dia mudar). Confirmação de email e recuperação de senha ficam para uma fatia futura da FASE 2 (dependem de escolher um mailer). Com a FASE 11 concluída, não sobra nenhuma fase do roadmap principal (0–11) em andamento.

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

Abre o app Electron de verdade (não só uma aba de navegador), com hot-reload. `npm run typecheck` roda o `tsc --noEmit` separado para `main`/`preload` (Node) e `renderer` (DOM).

### Gerando o instalador (Windows)

```bash
cd desktop
npm run dist:win
```

Roda `npm run build` (typecheck + `electron-vite build`) e depois empacota com o [`electron-builder`](https://www.electron.build/) (`^26.15.3`, config em `desktop/electron-builder.yml`), gerando um instalador NSIS em `desktop/dist/tora-dos-burro-desktop-<versão>-setup.exe`. Instala por usuário (não precisa de admin), cria atalho na área de trabalho e entrada em "Aplicativos" do Windows com desinstalador. **Sem assinatura de código** (precisa de certificado pago, fora de escopo pra um deploy privado de ~20 pessoas) — o Windows SmartScreen vai avisar "editor desconhecido" na primeira execução, é esperado; a pessoa clica em "Mais informações" → "Executar assim mesmo". Sem auto-update configurado — atualizar significa rodar o instalador novo de novo por cima.

Só o alvo Windows está configurado por enquanto (única plataforma usada e testável neste projeto) — macOS/Linux ficam para quando fizer sentido, adicionando blocos `mac`/`linux` no mesmo `electron-builder.yml` (ver [docs de distribuição do electron-vite](https://electron-vite.org/guide/distribution)).

## Próximos passos

**FASE 11 (Electron) está concluída** (`v0.16.0`) — chat, voz, vídeo, compartilhamento de tela, Go Live e empacotamento todos com fluxo de cliente ligado e verificado ao vivo. Amigos/DM e FASE 10 (arquivos avançado) saem do planejado — servidor único, uso privado por ~20 pessoas, nunca público. Ainda em aberto (nenhum bloqueia o uso do app hoje):

- **Anexos leves** (fecha a FASE 4, precisa de `docker compose up -d`)
- Verificação de mídia real do Go Live contra um LiveKit rodando (precisa de `docker compose up -d` — o fluxo de cliente já está pronto e o erro de conexão sem servidor já foi verificado ao vivo)

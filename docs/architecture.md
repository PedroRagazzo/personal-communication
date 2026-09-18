# Arquitetura — TORA DOS BURRO

## Visão geral

Plataforma de comunicação em tempo real estilo Discord: servidores/comunidades, canais de texto e voz, chat em tempo real, mensagens diretas, voz e vídeo via WebRTC, compartilhamento de tela (recurso de destaque do produto), Go Live e upload de arquivos.

Arquitetura própria, modular desde o início (sem microsserviços prematuros), com três planos estritamente separados:

- **Control Plane** (Elixir/Phoenix): autenticação, usuários, servidores, canais, permissões, presença, sinalização WebRTC.
- **Media Plane** (WebRTC + servidores de mídia): transporte de áudio, vídeo, tela, Go Live.
- **Data Plane** (PostgreSQL, Redis, Object Storage): persistência.

Regra que atravessa todo o projeto: **o Phoenix nunca carrega áudio/vídeo pesado** — apenas sinalização (SDP/ICE) via Channels. Mídia real trafega por WebRTC (DTLS-SRTP), nunca pelo WebSocket.

## Escopo do MVP

**Dentro do MVP** (FASES 1–8, cada uma funcional antes de avançar para a próxima):

- Backend Phoenix modular único
- Autenticação (registro, login, logout, tokens)
- Usuários, servidores, membros, cargos, permissões (por cargo e por canal), convites, banimento/expulsão
- Chat de texto em tempo real: envio, edição, exclusão, respostas, reações, digitação, histórico paginado
- Anexos de arquivo leves (imagens/arquivos pequenos, com limite de tamanho e validação de tipo)
- Canais de texto e voz, categorias, ordenação
- Voz: entrar/sair, mute/deafen, presença — WebRTC mesh
- Vídeo: câmera ligar/desligar, seleção de dispositivo — limitado a canais de voz de servidor (não DM)
- Compartilhamento de tela: tela inteira/janela/app, parar compartilhamento

**Fora do MVP:**

- Amigos / Mensagens Diretas (schema já preparado — ver `database.md` — mas funcionalidade é fast-follow pós-MVP, para não abrir um subsistema inteiro de uma vez)
- Go Live (transmissão um-para-muitos, precisa de SFU — FASE 9)
- Rust, C++, Python (entram só com necessidade real medida — FASES 12–14)
- Escalabilidade horizontal/clustering (FASE 15), SDK (FASE 17)

**Nota sobre o roadmap original:** o documento-fonte lista "Uploads" como FASE 10, depois do Go Live — mas um chat sem nenhum anexo não é utilizável de verdade, e a própria FASE 4 fica incompleta sem isso. Por isso anexos **leves** entram na FASE 4 (MVP), e a FASE 10 passa a significar "gestão avançada de arquivos" (arquivos grandes, upload retomável, cotas, CDN) — endurecimento pós-MVP, não a introdução do recurso. Ver `roadmap.md`.

## Arquitetura geral

```
                    ┌──────────────────────┐
                    │   React + Electron    │
                    │      TypeScript       │
                    │  main / preload /     │
                    │  renderer (isolados)  │
                    └──────────┬────────────┘
                               │
                    HTTPS / WSS (sinalização)
                               │
                               ▼
                    ┌──────────────────────┐
                    │   ELIXIR + PHOENIX    │   CONTROL PLANE
                    │ Auth · Users · Servers│
                    │ Channels · Permissions│
                    │ Presence · Sinalização│
                    │ WebRTC (SDP/ICE only) │
                    └───────┬──────┬────────┘
                            │      │
                    ┌───────┘      └────────┐
                    ▼                        ▼
             ┌─────────────┐          ┌─────────────┐
             │ PostgreSQL  │          │    Redis    │   DATA PLANE
             └─────────────┘          └─────────────┘   (+ Object Storage)

                         MEDIA PLANE (DTLS-SRTP, nunca via WebSocket)
                           │
                           ▼
              MVP: mesh P2P direto entre peers
              (STUN + coturn TURN de fallback)
                           │
                           ▼
              Pós-MVP (Go Live / salas grandes):
              SFU adotado (mediasoup ou LiveKit — ver media.md)
                           │
                           ▼
              Futuro: Rust Media Services → C++ Engine (DSP/áudio/vídeo)

                         DATA / ML (desacoplado, fora do caminho quente)
                           │
                           ▼
                    Python — Analytics / ML / Moderação
                    (consumindo eventos via fila, nunca síncrono)
```

## Responsabilidade de cada linguagem

| Linguagem | Responsabilidade | Quando entra |
|---|---|---|
| **Elixir/Phoenix** | Núcleo: auth, usuários, servidores, canais, mensagens, presença, permissões, sessões, sinalização WebRTC, tolerância a falhas (OTP) | FASE 1 |
| **TypeScript/React** | Interface: chat, servidores, canais, perfil, configurações, chamadas, lista de usuários | FASE 11 |
| **Electron** | App desktop: janela, microfone, câmera, captura de tela, notificações, atalhos, integração com SO | FASE 11 |
| **WebRTC nativo** | Transporte de áudio/vídeo/tela — `RTCPeerConnection` nativo do Chromium, sem wrapper, para controle fino do "perfect negotiation" | FASE 6–8 |
| **Rust** | Processamento de mídia de alto desempenho, pipeline de vídeo, SDK — só depois do MVP funcional, quando houver necessidade real | FASE 12 |
| **C++** | DSP/áudio extremo, redução de ruído — chamado **a partir do Rust**, nunca direto por Elixir/Electron | FASE 13 |
| **Python** | Analytics, ML, moderação automática, detecção de spam — desacoplado do núcleo, eventos assíncronos | FASE 14 |

Antes de introduzir C++ em qualquer componente, responder (regra do projeto): por que TypeScript não é suficiente? Por que Rust não é suficiente? Qual ganho de performance é esperado, medido? Qual o custo de manutenção?

## Estrutura de diretórios

```
tora-dos-burro/
├── backend/        Elixir/Phoenix (lib/, test/, priv/, config/)
├── desktop/        React + Electron + TS (src/{main,preload,components,pages,hooks,stores,services,websocket,webrtc,audio,video}/)
├── rust/           media/, encoder/, sdk/, networking/ — placeholders até FASE 12
├── cpp/            audio/, dsp/, video/, capture/ — placeholders até FASE 13
├── python/         analytics/, ml/, moderation/, data/ — placeholders até FASE 14
├── docs/           esta documentação
├── docker/         configuração de infraestrutura local
├── docker-compose.yml
└── README.md
```

`desktop/src/main/` e `desktop/src/preload/` existem desde o início (mesmo vazios) porque a captura de tela **precisa** rodar no processo `main` do Electron (`desktopCapturer`) — separar isso agora evita retrofitar isolamento de contexto depois que código do renderer já assumir acesso direto ao Node. Configuração alvo: `contextIsolation: true`, `nodeIntegration: false`, ponte tipada via `contextBridge`.

## Decisões de versão (confirmadas em setembro/2026, revalidar no início de cada fase)

- Elixir alvo: **1.20.x**, que exige **OTP 27+** (não confundir com o piso mínimo do Phoenix 1.8, que é OTP 25 — são pisos diferentes, o projeto usa o mais alto dos dois).
- Phoenix: **~> 1.8**.
- Electron: **44.x** (embute Node ~24.x LTS).
- Captura de tela no Electron: `desktopCapturer.getSources()` (processo main) alimentando `session.setDisplayMediaRequestHandler` + `getDisplayMedia()` padrão no renderer — API moderna (Electron 22+), preferível ao padrão legado `getUserMedia` + `chromeMediaSource`.

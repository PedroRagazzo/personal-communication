# Media Plane — Voz, Vídeo, Compartilhamento de Tela e Go Live

Sinalização (SDP/ICE) sempre via Phoenix Channels (`voice:{channel_id}`, ver `realtime.md`) — mídia em si nunca passa pelo WebSocket. Transporte real via WebRTC, protegido por **DTLS-SRTP** (camada separada da TLS do WSS/HTTPS que protege a sinalização — "TLS em tudo" não cobre o transporte de mídia sozinho).

## Estratégia WebRTC

- **MVP: topologia mesh** — cada peer conecta diretamente a cada peer do canal de voz.
- STUN público (ou auto-hospedado) + **coturn** como TURN de fallback para NAT traversal.
- Credenciais do TURN **temporárias via TURN REST API** (`use-auth-secret` no coturn) — nunca usuário/senha estático, que vira relay aberto sujeito a abuso. Ver `docker/coturn/turnserver.conf` e `security.md`.
- Padrão **perfect negotiation** (papéis polite/impolite, definidos deterministicamente por comparação de `user_id`) adotado desde a FASE 6 — evita colisão de renegociação SDP quando entradas/saídas/compartilhamentos de tela acontecem simultaneamente em uma malha com N*(N-1) conexões. Retrofitar isso depois que já existir código de renegociação ad-hoc é doloroso, por isso entra desde o início.
- Abstração `MediaSession` com `AudioTrack` / `VideoTrack` / `ScreenTrack`.

## Limites do mesh (MVP)

Mesh escala mal com vídeo porque cada participante precisa decodificar um stream por peer. Limites explícitos, aplicados **no servidor** (Phoenix Channel), não deixados a cargo do cliente:

- Canal só-áudio: confortável até **~8 participantes** (opus é ~24–64kbps por stream, custo de fan-out é baixo).
- Assim que vídeo ou tela entra em jogo, o limite passa a ser por **faixas de vídeo concorrentes**, não por pessoas: câmera e compartilhamento de tela contam juntos.
- **Máximo 4 participantes com vídeo habilitado por canal.**
- **Apenas 1 compartilhamento de tela ativo por vez por canal.**
- Aplicação: o Channel rejeita a adição da 5ª faixa de vídeo ou do 2º compartilhamento simultâneo; o cliente cai para áudio-only ou mostra erro claro — nunca decidido só no cliente.
- Acima desses limites (salas maiores, Go Live): migrar para SFU (ver abaixo).

## Fluxo de voz

```
Electron → join "voice:{channel_id}"
   │
   ▼
Phoenix: verifica permissão + limite de participantes/vídeo do canal
   │
   ▼
Phoenix.Presence registra entrada; lista de peers atuais enviada ao novo peer
   │
   ▼
Sinalização (SDP offer/answer, ICE candidates) relayada via Channel
   (perfect negotiation — ver acima)
   │
   ▼
STUN primeiro; coturn (TURN) como fallback, credenciais temporárias
   │
   ▼
Mute/Deafen = track local habilitado/desabilitado + metadata no Presence
   │
   ▼
Sair → desmonta todas as peer connections + untrack no Presence
```

**Lado do servidor implementado (FASE 6)**: `ToraDosBurroWeb.VoiceChannel` no tópico
`voice:{channel_id}` — `join` exige que o canal seja `guild_voice` e checa
`:connect` via `Channels.authorize/3` (respeita `permission_overwrites` da
FASE 5); `Phoenix.Presence` (`ToraDosBurroWeb.Presence`) rastreia quem está
na sala com metadata `muted`/`deafened`; eventos `sdp:offer`, `sdp:answer`,
`ice:candidate` (todos com `to`/`from`) e `state:update` (mute/deafen) são
retransmitidos via `broadcast_from!` — cada cliente filtra pelo `to`. Sem
tabela nova: é tudo efêmero em Presence, como o `database.md` já previa.

**Ainda não implementado** (depende do cliente Electron, FASE 11): as peer
connections WebRTC de verdade, perfect negotiation, STUN/coturn.

## Fluxo de vídeo

Ligar câmera = adicionar `VideoTrack` às peer connections existentes do canal + renegociar (reaproveita o relay de SDP/ICE da FASE 6 — mesmo tópico `voice:{channel_id}`, não é um canal novo). Seleção de dispositivo/resolução/FPS no cliente. **Escopo limitado a canais de voz de servidor no MVP** (não chamadas em DM — quando Amigos/DM entrar pós-MVP, reaproveita o mesmo mecanismo).

**Implementado**: eventos `video:enable`/`video:disable` no `VoiceChannel`,
com metadata `video` no Presence. Cap de 4 participantes com vídeo aplicado
no servidor no momento de **habilitar** (não só no join do canal) —
`video:enable` responde `{:error, %{reason: "video_limit_reached"}}` quando
a sala já tem 4 com vídeo; reenviar `video:enable` para quem já está entre
os 4 é idempotente (não conta em dobro contra o próprio limite).

## Fluxo de compartilhamento de tela

```
Processo main (Electron): desktopCapturer.getSources({types:['window','screen']})
   │
   ▼
IPC tipado via contextBridge (preload) → renderer
   │
   ▼
Renderer: session.setDisplayMediaRequestHandler alimentando
getDisplayMedia() padrão (Electron 22+) — preferível ao getUserMedia
+ chromeMediaSource legado
   │
   ▼
ScreenTrack adicionada à(s) peer connection(s) mesh já existentes do canal
   │
   ▼
Renegociação (perfect negotiation) — servidor recusa se já houver
outro compartilhamento ativo no canal (limite de 1 por vez)
   │
   ▼
Parar compartilhamento → remove track → renegocia
```

Nunca passa pelo WebSocket. Áudio do sistema junto com a tela: *nice-to-have* pós-MVP (suporte varia por SO).

**Implementado (lado servidor)**: `screen_share:start`/`screen_share:stop` no
mesmo `VoiceChannel`, com metadata `screen_sharing` no Presence. Diferente
do cap de vídeo (até 4 ao mesmo tempo), é um recurso exclusivo — só um
compartilhamento por sala. `screen_share:start` responde
`{:error, %{reason: "screen_share_in_use"}}` se outra pessoa já está
compartilhando; é idempotente para quem já é o compartilhador atual; parar
libera a sala para qualquer outro membro. A parte client-side (captura de
verdade, `desktopCapturer`, renegociação) segue dependendo do Electron —
FASE 11.

## Fluxo do Go Live (pós-MVP, FASE 9)

Mesh não escala para um-para-muitos — aqui um SFU é obrigatório.

```
Streamer → Capture → Encoder → SFU (adotado, não construído do zero) → Viewers (N)
```

**Decisão de build-vs-adopt:** construir um SFU do zero (bandwidth estimation, jitter buffer, simulcast, congestion control) sem necessidade medida é exatamente o anti-padrão que a regra "Rust só depois do MVP, com necessidade real" existe para evitar. Adotar um SFU open-source pronto é a leitura correta dessa regra. O trabalho de Rust da FASE 12 fica **redirecionado, não cancelado**: passa a mirar serviços ao lado do SFU adotado (workers de gravação/composição, pipelines de DSP consumindo tracks via SDK do SFU) — escalar para "construir/fork um SFU em Rust" só se métricas concretas justificarem.

**Decisão em aberto — revisitar no início da FASE 9** (fora do MVP, não travada agora):

| Opção | A favor | Contra |
|---|---|---|
| **mediasoup** | Engine de baixo nível (C++ + control plane), controle total. Tem crate Rust oficial mantido (`mediasoup-rust`, ~0.27 em ago/2026) como control plane alternativo ao Node — ponte natural para a ambição de Rust da FASE 12 | Mais complexidade operacional |
| **LiveKit** | Plataforma completa (SFU em Go + SDKs + gravação/egress + gestão de sala pronta). Mais rápido para lançar | Núcleo em Go diverge da trajetória Rust do projeto; SDK Rust é só para *consumir*, não estender o servidor |

Janus foi descartado do shortlist: seu diferencial é ponte SIP/RTSP, que este projeto não precisa.

**Recomendação preliminar:** mediasoup, por alinhar com a trajetória Rust de longo prazo — mas LiveKit é a opção pragmática se velocidade de lançamento pesar mais nesse momento. Decisão final a confirmar com o time no kickoff da FASE 9.

## Comunicação Elixir ↔ Rust ↔ C++ ↔ Python (contrato para quando essas fases chegarem)

Dois contratos diferentes, escolhidos pelo formato do componente — "gRPC para tudo" seria a escolha errada para código de DSP por frame:

- **Rustler NIFs** — padrão para chamadas síncronas, em processo, de baixa latência (ex.: DSP de áudio por frame, quando o motor C++ existir por baixo do Rust). Trade-off aceito conscientemente: NIF roda no processo do próprio BEAM — usar *dirty schedulers* para nunca bloquear o scheduler principal.
- **gRPC** (contrato `.proto` definido) — para componentes Rust implantados como serviço independente, escalado e isolado separadamente (ex.: frota de workers de processamento de mídia/gravação).
- **Python**: eventos assíncronos via **Redis Streams** (não pub/sub simples — pub/sub perde eventos para consumidores offline; Streams persiste e tem consumer groups) ou NATS JetStream. Nunca no caminho quente do realtime.
- **C++** só é chamado pelo Rust (bridge `cxx`/`bindgen`), nunca direto por Elixir ou Electron.

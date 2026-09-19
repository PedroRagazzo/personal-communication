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

**Lado do cliente implementado (FASE 11, fatia 4)**: mesh WebRTC de
verdade em `desktop/src/renderer/src/webrtc/MeshManager.ts` — uma
`RTCPeerConnection` por participante, perfect negotiation com papel
polite/impolite por comparação de `user_id` (igual especificado acima),
fila de ICE candidates que chegam antes do `setRemoteDescription`
resolver. `stores/voiceStore.ts` usa a classe `Presence` do próprio
pacote `phoenix` (não reimplementa parsing de `presence_state`/`diff`) pra
saber quem entra/sai e criar/destruir peer connections. Verificado com
dois clientes reais (duas abas independentes, cada uma com seu próprio
usuário e stream de áudio sintético via Web Audio API — não precisa de
microfone físico pra validar a malha) trocando tracks de áudio de
verdade nos dois sentidos. **Só STUN público** (`stun:stun.l.google.com`)
por enquanto — coturn (TURN) já está no `docker-compose.yml` mas não dá
pra testar aqui (sem Docker, mesma limitação de sempre); falta ligar o
cliente nele quando o ambiente permitir.

**Ainda não implementado (voz)**: deafen (só mute por enquanto), indicador
persistente de "conectado à voz" visível fora do canal selecionado
(hoje sair da visão do canal esconde os controles, mas a chamada continua
ativa em segundo plano — comportamento correto, só falta a UI pra
mostrar isso de qualquer lugar do app).

**Bug real encontrado e corrigido na fatia 5, afeta desde a fatia 1**: o
preload (`desktop/src/preload/`) nunca carregava de verdade dentro do
Electron real — só parecia estar tudo certo porque toda verificação
anterior rodava contra o dev server do Vite numa aba de navegador comum
(sem preload nenhum, então a ausência de `window.api` sempre parecia
"esperada"). Causa raiz: `sandbox: true` no `main` **não suporta preload
em ESM** — o electron-vite gera o preload como `.mjs` por padrão, mas o
carregador sandboxado do Electron só aceita CommonJS, e falhava com
`SyntaxError: Cannot use import statement outside a module` sem avisar
na tela, só no console da própria janela (só visível conectando via
`--remoteDebuggingPort` do electron-vite e inspecionando por CDP — não
tinha como ver isso pelo browser pane, que é uma instância Chromium
separada sem preload nenhum). Corrigido forçando `output: { format:
'cjs' }` no bloco `preload` do `electron.vite.config.ts`, mantendo
`sandbox: true` (a alternativa seria desligar o sandbox, que enfraquece
a segurança à toa — a causa era só formato de build, não precisava
disso). **Consequência prática**: `safeStorage`/persistência de sessão
(fatia 1) nunca tinha sido verificada de verdade dentro do Electron real
até agora — reverificado depois do fix, funciona de ponta a ponta
(token persistido criptografado em disco, sessão restaurada após
"reiniciar" o app).

**Lado do cliente implementado (FASE 11, fatia 5) — compartilhamento de
tela**: `desktopCapturer.getSources()` só roda no processo `main`
(sandbox bloqueia no renderer); `ScreenSharePicker.tsx` no renderer
mostra a lista com miniaturas reais (sem picker nativo no Windows —
`useSystemPicker` do Electron é experimental e só existe no macOS 15+).
Fluxo: usuário escolhe a fonte → `window.api.screenShare.selectSource`
avisa o `main` → `getDisplayMedia()` dispara
`session.setDisplayMediaRequestHandler`, que já sabe o que liberar.
`MeshManager.setScreenTrack()` adiciona a track de vídeo às mesmas peer
connections da voz (nunca um mesh separado) — renegocia sozinho via o
mesmo perfect negotiation. **Reivindicação do slot exclusivo
(`screen_share:start`) só acontece depois que o usuário já escolheu a
fonte**, não antes — assim ninguém passa pela escolha de janela à toa se
alguém já estiver compartilhando. Verificado com hardware de verdade:
tela real (2560×1440) capturada no Electron de verdade (via CDP, já que
`desktopCapturer` não existe fora do Electron) e recebida — track de
vídeo íntegra, mesma resolução — por um segundo peer completamente
independente.

**Ainda não implementado (tela)**: áudio do sistema junto com a
transmissão (nice-to-have já documentado acima), cap/exclusividade
refletido na UI de forma mais clara (hoje só a mensagem de erro avisa).

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

## Fluxo do Go Live (FASE 9)

Mesh não escala para um-para-muitos — aqui um SFU é obrigatório.

```
Streamer → Capture → Encoder → SFU (LiveKit) → Viewers (N)
```

**Decisão de build-vs-adopt:** construir um SFU do zero (bandwidth estimation, jitter buffer, simulcast, congestion control) sem necessidade medida é exatamente o anti-padrão que a regra "Rust só depois do MVP, com necessidade real" existe para evitar. Adotar um SFU open-source pronto é a leitura correta dessa regra. O trabalho de Rust da FASE 12 fica **redirecionado, não cancelado**: passa a mirar serviços ao lado do SFU adotado (workers de gravação/composição, pipelines de DSP consumindo tracks via SDK do SFU) — escalar para "construir/fork um SFU em Rust" só se métricas concretas justificarem.

**Decisão de SFU: LiveKit** (não mediasoup). A recomendação preliminar do FASE 0 (`media.md` original) apontava mediasoup pela trajetória Rust de longo prazo — revertida no kickoff da FASE 9 depois de escopar o esforço de integração de verdade: mediasoup é só o engine (C++) + control plane, sem camada de sinalização/sala/protocolo pronta, então adotá-lo significaria **construir um servidor de mídia inteiro do zero** — exatamente o microsserviço prematuro que a Regra 10 do projeto proíbe. LiveKit já é uma plataforma completa (SFU + gestão de sala + SDKs), o que reduz drasticamente o que precisa ser construído agora. Janus segue fora do shortlist (o diferencial dele é ponte SIP/RTSP, que este projeto não precisa).

**Implementado (lado servidor, FASE 9):**

- `ToraDosBurro.GoLive` (contexto) + `ToraDosBurroWeb.GoLiveChannel` (tópico `live:{channel_id}`, canal precisa ser `guild_voice`, igual à voz).
- Nova permissão `:stream` (bitfield), padrão para membros comuns — igual ao Discord real, onde "Stream" também é uma permissão base de `@everyone`.
- `join` autoriza `:connect` e devolve um token *subscriber-only* (`canPublish: false`); evento `golive:start` eleva para um token *publisher*, autorizando `:stream` nesse momento (não só no join) — mesmo padrão que `video:enable` já usa na FASE 7. `golive:stop` volta a `live: false`.
- **Sem limite de "1 streamer por sala"**, diferente do compartilhamento de tela da FASE 8: aquele limite existe por causa do mesh (cada peer a mais decodificando é custo real); com um SFU, múltiplos publishers na mesma sala é uso normal — recriar aquele limite aqui seria uma restrição artificial, sem motivo técnico.
- Quem está ao vivo/assistindo é só `Phoenix.Presence` (`live: true/false` na metadata), mesmo padrão efêmero da voz — nunca persistido.
- **Geração de token via `joken` (não o pacote hex `livekit`)**: o único wrapper Elixir para LiveKit no hex.pm é pequeno, mantido por terceiro (não a LiveKit), cobre só ~60-70% da API e não teve release recente — arriscado demais para confiar às cegas. A forma exata do JWT (claims `iss`/`sub`/`exp`/`nbf` + grant `video` com `room`/`roomJoin`/`canPublish`/`canSubscribe`/`canPublishData`) foi verificada direto na documentação oficial (`docs.livekit.io/home/server/generating-tokens`) e é gerada à mão em `ToraDosBurro.GoLive.LiveKitToken`, assinada com `joken` (`~> 2.7`, dependência madura e amplamente usada — sem relação com o LiveKit em si, só assina JWT genérico).
- **Sem chamadas à Room Service API** (`CreateRoom` etc.): uma sala do LiveKit é criada automaticamente no primeiro join autenticado com token válido (`roomJoin: true`), o que é suficiente para este escopo.
- `docker-compose.yml` ganhou um serviço `livekit` (`livekit-server --dev`, credenciais fixas `devkey`/`secret` — nunca usar `--dev` em produção).

**Verificado**: `mix test` (contexto + Channel, incluindo forma exata do JWT decodificado) e um cliente WebSocket real (Node + `phoenix`) contra `mix phx.server` rodando de verdade — join, `golive:start`/`golive:stop`, `presence_diff`, e dois streamers simultâneos na mesma sala. **Não verificável neste ambiente** (sem Docker, mesma limitação do MinIO/FASE 4): a transmissão de mídia de verdade contra um LiveKit rodando, e o lado cliente (conectar ao LiveKit, publicar/assistir tracks) — chega só com o Electron (FASE 11).

## Comunicação Elixir ↔ Rust ↔ C++ ↔ Python (contrato para quando essas fases chegarem)

Dois contratos diferentes, escolhidos pelo formato do componente — "gRPC para tudo" seria a escolha errada para código de DSP por frame:

- **Rustler NIFs** — padrão para chamadas síncronas, em processo, de baixa latência (ex.: DSP de áudio por frame, quando o motor C++ existir por baixo do Rust). Trade-off aceito conscientemente: NIF roda no processo do próprio BEAM — usar *dirty schedulers* para nunca bloquear o scheduler principal.
- **gRPC** (contrato `.proto` definido) — para componentes Rust implantados como serviço independente, escalado e isolado separadamente (ex.: frota de workers de processamento de mídia/gravação).
- **Python**: eventos assíncronos via **Redis Streams** (não pub/sub simples — pub/sub perde eventos para consumidores offline; Streams persiste e tem consumer groups) ou NATS JetStream. Nunca no caminho quente do realtime.
- **C++** só é chamado pelo Rust (bridge `cxx`/`bindgen`), nunca direto por Elixir ou Electron.

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
- Vídeo (câmera): **máximo 4 participantes com vídeo habilitado por canal**, aplicado no servidor no momento de habilitar — cada faixa a mais é mais um stream que todo mundo na chamada precisa decodificar.
- Aplicação: o Channel rejeita a adição da 5ª faixa de câmera; o cliente cai para áudio-only ou mostra erro claro — nunca decidido só no cliente.
- **Compartilhamento de tela não tem limite de simultâneos** (decisão revisada — ver nota abaixo). Isso é uma escolha deliberada de produto para este deploy específico, não uma correção geral do problema de fan-out do mesh: continua valendo que cada tela simultânea é mais uma faixa de vídeo que cada participante da chamada decodifica, exatamente como uma faixa de câmera a mais.
- Acima desses limites (salas maiores, Go Live): migrar para SFU (ver abaixo).

**Nota sobre a remoção do limite de 1 tela por vez**: desde a FASE 8, compartilhamento de tela foi exclusivo (só uma pessoa por sala), pelo mesmo motivo do cap de vídeo — custo de fan-out do mesh. Removido logo depois da fatia 6 da FASE 11 (vídeo/câmera), a pedido do usuário: este deploy é **um único servidor, uso privado por ~20 pessoas conhecidas, nunca público** — não o cenário de "sala grande e aberta" que o limite original supunha. A tradeoff (mais telas simultâneas = mais decode por peer) continua real e não foi resolvida, só aceita conscientemente dado o tamanho e o caráter do grupo; **não é uma mudança segura de generalizar** para um deploy público ou com salas de voz maiores sem reconsiderar. Ver `docs/roadmap.md`.

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

**Deafen implementado** (logo após a revisão do cap de tela, `v0.15.2`):
backend não mudou — `state:update` já aceitava `deafened` desde a FASE 6,
só nunca era usado pelo cliente. `voiceStore.ts` ganhou `localDeafened` +
`toggleDeafen()`; `VoicePanel.tsx` passa `localDeafened` como `muted` pros
elementos `<audio>` remotos (silencia só a reprodução local, não afeta o
que a pessoa ensurdecida transmite pros outros). Interlock deliberado,
igual ao Discord: ensurdecer força mute junto (falar sem conseguir ouvir a
resposta não faz sentido); desmutar enquanto ensurdecido também
desensurdece (senão a pessoa voltaria a falar sem perceber que ainda
estava sem ouvir nada); desensurdecer sozinho **não** desmuta — precisa de
uma ação separada. Verificado ao vivo (Electron real via CDP + peer
independente): as duas transições, presença refletindo `muted`/`deafened`
corretamente no outro peer, sem erros.

**Ainda não implementado (voz)**: indicador persistente de "conectado à
voz" visível fora do canal selecionado (hoje sair da visão do canal
esconde os controles, mas a chamada continua ativa em segundo plano —
comportamento correto, só falta a UI pra mostrar isso de qualquer lugar
do app).

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
mesmo perfect negotiation. `screen_share:start` (`voiceStore.ts`) só é
chamado depois que o usuário já escolheu a fonte, não antes — assim a
escolha de janela nunca é feita à toa se o push falhar por algum motivo
de canal (rede, etc.). Verificado com hardware de verdade: tela real
(2560×1440) capturada no Electron de verdade (via CDP, já que
`desktopCapturer` não existe fora do Electron) e recebida — track de
vídeo íntegra, mesma resolução — por um segundo peer completamente
independente. **Sem limite de compartilhamentos simultâneos por sala**
desde a revisão pós-fatia-6 (ver "Limites do mesh" acima) — `voiceStore.ts`
já renderiza um `<video>` por peer que está compartilhando
(`remoteScreenStreams` sempre foi um mapa por peer, não um único stream),
então múltiplas telas simultâneas não precisaram de nenhuma mudança de UI,
só a remoção do bloqueio no servidor.

**Ainda não implementado (tela)**: áudio do sistema junto com a
transmissão (nice-to-have já documentado acima).

## Fluxo de vídeo

Ligar câmera = adicionar `VideoTrack` às peer connections existentes do canal + renegociar (reaproveita o relay de SDP/ICE da FASE 6 — mesmo tópico `voice:{channel_id}`, não é um canal novo). Seleção de dispositivo/resolução/FPS no cliente. **Escopo limitado a canais de voz de servidor no MVP** (não chamadas em DM — quando Amigos/DM entrar pós-MVP, reaproveita o mesmo mecanismo).

**Implementado**: eventos `video:enable`/`video:disable` no `VoiceChannel`,
com metadata `video` no Presence. Cap de 4 participantes com vídeo aplicado
no servidor no momento de **habilitar** (não só no join do canal) —
`video:enable` responde `{:error, %{reason: "video_limit_reached"}}` quando
a sala já tem 4 com vídeo; reenviar `video:enable` para quem já está entre
os 4 é idempotente (não conta em dobro contra o próprio limite).

**Lado do cliente implementado (FASE 11, fatia 6)**: `voiceStore.toggleVideo()`
reivindica o slot no servidor (`video:enable`) **antes** de ligar a câmera —
ao contrário da tela, não existe nenhuma escolha de UI pra "desperdiçar" se a
sala já estiver cheia, então falhar rápido é melhor do que piscar a câmera à
toa; falha no `getUserMedia` depois de já ter reservado o slot manda
`video:disable` pra liberar de volta. `MeshManager.setCameraTrack()`/
`setScreenTrack()` usam criação **preguiçosa** de `RTCRtpSender` — só na
primeira vez que a câmera/tela realmente liga é que `addTrack` (e portanto
uma renegociação) acontece; toggles seguintes só trocam a track do sender já
existente via `replaceTrack` (nunca `removeTrack`), sem renegociar de novo.
Câmera e tela reaproveitam a mesma peer connection da voz — dá pra ter as
duas ativas ao mesmo tempo pra uma mesma pessoa. Sem transceiver fixo por
slot, a track de vídeo recebida não diz sozinha se é câmera ou tela — o
peer que recebe desambigua usando o que o Presence já informa sobre quem
mandou (`video`/`screen_sharing`), já que esse metadata sempre chega antes
da track em si.

**Dois bugs reais encontrados e corrigidos nesta fatia**, ambos só
reproduzíveis com dois peers de verdade trocando várias tracks (nunca
apareceram nos testes de fatia 4/5, que só exercitavam uma track de vídeo
por vez):

1. Pré-criar os dois transceivers de vídeo (câmera e tela) antecipadamente
   no `addPeer`, antes de qualquer negociação — abordagem descartada.
   Quebra quando há *glare* na negociação inicial (dois peers entrando
   quase ao mesmo tempo, ambos ofertando ao mesmo tempo): o lado que perde
   o glare faz rollback da própria oferta, e os transceivers que ele mesmo
   pré-criou ficam órfãos (nunca chegam a ser negociados) — a renegociação
   seguinte (ligar câmera/tela) tenta reaproveitá-los junto com os que
   vieram da oferta do outro lado, resultando numa oferta com m-lines fora
   de ordem (`InvalidAccessError: the order of m-lines... doesn't match`).
   Resolvido com a criação preguiçosa descrita acima — só cria o sender
   quando a câmera/tela liga de verdade, bem depois da negociação inicial
   já estar estável.
2. **Mais sutil**: `presence.onLeave` do lado do cliente derrubava e
   recriava a peer connection inteira toda vez que QUALQUER peer da sala
   mudava mute/deafen/vídeo/tela — não só quando alguém saía de verdade.
   `Presence.update` (usado por essas quatro ações, ver `voice_channel.ex`)
   manda um diff atômico de leave+join do mesmo par de metas, mas a
   computação desse diff roda numa `Task` assíncrona
   (`Phoenix.Presence.handle_diff/2`); sob rajada de updates próximos (ex.:
   ligar câmera e, segundos depois, ligar tela) as tasks podem terminar
   fora de ordem, fazendo o cliente enxergar um "leave" sem o join
   correspondente ainda aplicado. Resultado: a peer connection era fechada
   e recriada do zero no meio da chamada, perdendo todo o histórico de
   negociação — a oferta seguinte não batia mais com o que o outro lado
   já tinha negociado (mesmo sintoma de m-lines fora de ordem do bug 1,
   causa raiz completamente diferente). Corrigido removendo esse gatilho:
   `presence.onLeave` não derruba mais a peer connection — quem decide se
   um peer realmente sumiu é o próprio WebRTC (`connectionstatechange` vira
   `failed`/`closed`), não a semântica de diff do Presence. A lista de
   participantes na UI continua atualizando na hora via `presence.onSync`
   (inalterado); só a limpeza da conexão de mídia em si fica mais lenta
   numa saída de verdade (segue o timeout normal de detecção de ICE, não
   mais instantânea) — troca aceita conscientemente em troca de nunca mais
   derrubar uma chamada ativa por um falso positivo.

Verificado com dois clientes reais (Electron real via CDP + um segundo peer
independente) trocando câmera sintética (canvas) e tela real/sintética nos
dois sentidos, repetidas vezes, incluindo o cenário que expôs os dois bugs
acima (áudio + câmera + tela simultâneos, trocando qual peer está
compartilhando a tela várias vezes seguidas) — zero erros de negociação após
as correções, streams sempre classificados corretamente (câmera vs tela) dos
dois lados.

**Ainda não implementado (vídeo)**: seleção de dispositivo/resolução/FPS
(sempre pega o device default do SO por enquanto), indicador de cap
atingido mais rico na UI (hoje só desabilita o botão com um `title`).

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
Renegociação (perfect negotiation) — sem limite de compartilhamentos
simultâneos por sala (ver "Limites do mesh" acima)
   │
   ▼
Parar compartilhamento → replaceTrack(null) → sem renegociar de novo
```

Nunca passa pelo WebSocket. Áudio do sistema junto com a tela: *nice-to-have* pós-MVP (suporte varia por SO).

**Implementado (lado servidor)**: `screen_share:start`/`screen_share:stop` no
mesmo `VoiceChannel`, com metadata `screen_sharing` no Presence — sempre
respondem `:ok`, sem checagem de exclusividade (removida pós-fatia-6 da
FASE 11, ver "Limites do mesh" acima). A parte client-side (captura de
verdade, `desktopCapturer`, renegociação) está implementada desde a FASE
11 fatia 5.

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

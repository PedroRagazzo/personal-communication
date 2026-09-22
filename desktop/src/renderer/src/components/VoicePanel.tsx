import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChannelSummary, ServerMember } from '../services/api'
import { useVoiceStore, type ScreenShareQuality } from '../stores/voiceStore'
import { useGoLiveStore } from '../stores/goLiveStore'
import { ScreenSharePicker, RESOLUTIONS, FRAME_RATES } from './ScreenSharePicker'

// Voz (FASE 11, fatia 4) + compartilhamento de tela (fatia 5) + câmera
// (fatia 6) + Go Live (fatia 10): conectar entra no mesh WebRTC de
// verdade (mic real) E no Go Live (LiveKit, subscriber-only até alguém
// apertar "Ir ao vivo") ao mesmo tempo — são duas conexões
// completamente separadas (mesh P2P vs SFU), só compartilham o botão
// Conectar/Sair por conveniência de UX. Tela e câmera adicionam tracks
// de vídeo às mesmas peer connections do mesh (não são meshes
// separados, e podem estar ativas ao mesmo tempo); Go Live nunca passa
// pelo mesh, vai direto pro LiveKit. As conexões vivem nas stores, não
// neste componente — trocar de canal só esconde os controles, não
// desconecta (mesmo comportamento do Discord: sair da visão do canal
// de voz não te tira da chamada). Falta pra uma próxima fatia: uma
// barra persistente mostrando "conectado em #x" visível de qualquer
// lugar do app.
export function VoicePanel({
  channel,
  currentUserId,
  members
}: {
  channel: ChannelSummary
  currentUserId: string
  members: ServerMember[]
}) {
  const status = useVoiceStore((s) => s.status)
  const activeChannelId = useVoiceStore((s) => s.channelId)
  const participants = useVoiceStore((s) => s.participants)
  const localMuted = useVoiceStore((s) => s.localMuted)
  const localDeafened = useVoiceStore((s) => s.localDeafened)
  const localPlaybackMuted = useVoiceStore((s) => s.localPlaybackMuted)
  const remoteAudioStreams = useVoiceStore((s) => s.remoteAudioStreams)
  const remoteMicVolumes = useVoiceStore((s) => s.remoteMicVolumes)
  const remoteScreenVolumes = useVoiceStore((s) => s.remoteScreenVolumes)
  const setRemoteMicVolume = useVoiceStore((s) => s.setRemoteMicVolume)
  const setRemoteScreenVolume = useVoiceStore((s) => s.setRemoteScreenVolume)
  const speakingUserIds = useVoiceStore((s) => s.speakingUserIds)
  const screenSharing = useVoiceStore((s) => s.screenSharing)
  const localScreenStream = useVoiceStore((s) => s.localScreenStream)
  const screenShareQuality = useVoiceStore((s) => s.screenShareQuality)
  const remoteScreenStreams = useVoiceStore((s) => s.remoteScreenStreams)
  const videoEnabled = useVoiceStore((s) => s.videoEnabled)
  const localCameraStream = useVoiceStore((s) => s.localCameraStream)
  const remoteCameraStreams = useVoiceStore((s) => s.remoteCameraStreams)
  const error = useVoiceStore((s) => s.error)
  const join = useVoiceStore((s) => s.join)
  const leave = useVoiceStore((s) => s.leave)
  const toggleMute = useVoiceStore((s) => s.toggleMute)
  const toggleDeafen = useVoiceStore((s) => s.toggleDeafen)
  const startScreenShare = useVoiceStore((s) => s.startScreenShare)
  const updateScreenShareQuality = useVoiceStore((s) => s.updateScreenShareQuality)
  const stopScreenShare = useVoiceStore((s) => s.stopScreenShare)
  const toggleVideo = useVoiceStore((s) => s.toggleVideo)

  const goLiveStatus = useGoLiveStore((s) => s.status)
  const goLiveParticipants = useGoLiveStore((s) => s.participants)
  const isLive = useGoLiveStore((s) => s.isLive)
  const localLiveStream = useGoLiveStore((s) => s.localStream)
  const remoteLiveStreams = useGoLiveStore((s) => s.remoteStreams)
  const watchingUserIds = useGoLiveStore((s) => s.watchingUserIds)
  const remoteGoLiveVolumes = useGoLiveStore((s) => s.remoteVolumes)
  const setRemoteGoLiveVolume = useGoLiveStore((s) => s.setRemoteVolume)
  const goLiveError = useGoLiveStore((s) => s.error)
  const joinGoLive = useGoLiveStore((s) => s.join)
  const leaveGoLive = useGoLiveStore((s) => s.leave)
  const startGoLive = useGoLiveStore((s) => s.startGoLive)
  const stopGoLive = useGoLiveStore((s) => s.stopGoLive)
  const watchStream = useGoLiveStore((s) => s.watchStream)
  const stopWatchingStream = useGoLiveStore((s) => s.stopWatchingStream)

  const [pickerTarget, setPickerTarget] = useState<'screen' | 'golive' | null>(null)

  // Menu de contexto de volume (botão direito) — um só popover compartilhado
  // por mic/tela/transmissão em vez de um por linha/tile, pra não duplicar
  // o estado de abrir/fechar em cada item da lista. `target` só guarda QUEM
  // e QUAL dicionário; o valor atual é lido ao vivo da store no render (ver
  // abaixo), nunca um snapshot — assim arrastar o slider não fica
  // reaplicando um valor velho.
  const [volumeMenu, setVolumeMenu] = useState<{
    x: number
    y: number
    target: { kind: 'mic' | 'screen' | 'golive'; peerId: string }
  } | null>(null)

  function openVolumeMenu(
    e: React.MouseEvent,
    target: { kind: 'mic' | 'screen' | 'golive'; peerId: string }
  ): void {
    e.preventDefault()
    setVolumeMenu({
      x: Math.min(e.clientX, window.innerWidth - 240),
      y: Math.min(e.clientY, window.innerHeight - 120),
      target
    })
  }

  const volumeMenuValue =
    volumeMenu &&
    (volumeMenu.target.kind === 'mic'
      ? (remoteMicVolumes[volumeMenu.target.peerId] ?? 1)
      : volumeMenu.target.kind === 'screen'
        ? (remoteScreenVolumes[volumeMenu.target.peerId] ?? 1)
        : (remoteGoLiveVolumes[volumeMenu.target.peerId] ?? 1))

  function handleVolumeMenuChange(volume: number): void {
    if (!volumeMenu) return
    const { kind, peerId } = volumeMenu.target
    if (kind === 'mic') setRemoteMicVolume(peerId, volume)
    else if (kind === 'screen') setRemoteScreenVolume(peerId, volume)
    else setRemoteGoLiveVolume(peerId, volume)
  }

  // Junta a própria tela (se estiver compartilhando) com a de cada peer
  // remoto numa lista só — é o que decide se mostra uma tela só (como
  // antes) ou a grade com destaque (2+ ao mesmo tempo).
  const screenShares = useMemo(() => {
    const shares: { id: string; stream: MediaStream; label: string }[] = []
    if (localScreenStream) {
      shares.push({ id: currentUserId, stream: localScreenStream, label: 'Você' })
    }
    for (const [peerId, stream] of Object.entries(remoteScreenStreams)) {
      shares.push({ id: peerId, stream, label: participantName(peerId) })
    }
    return shares
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localScreenStream, remoteScreenStreams, currentUserId, members])

  const connectedHere = status === 'connected' && activeChannelId === channel.id
  const connectingHere = status === 'connecting' && activeChannelId === channel.id
  // Só um hint de UI (evita ligar a câmera à toa pra ser rejeitado) — o
  // servidor sempre reaplica o limite de verdade, nunca confia só nisso.
  const videoCapReached = !videoEnabled && participants.filter((p) => p.video).length >= 4

  function participantName(userId: string): string {
    if (userId === currentUserId) return 'Você'
    const member = members.find((m) => m.user.id === userId)
    return member ? `${member.user.username}#${member.user.discriminator}` : 'desconhecido'
  }

  function isParticipantLive(userId: string): boolean {
    if (userId === currentUserId) return isLive
    return goLiveParticipants.some((p) => p.userId === userId && p.live)
  }

  function handleConnect(): void {
    join(channel.id, currentUserId)
    joinGoLive(channel.id)
  }

  function handleLeave(): void {
    leave()
    leaveGoLive()
  }

  return (
    <div className="rig-grid flex flex-1 flex-col items-center gap-5 overflow-y-auto bg-void p-6">
      <div className="flex items-center gap-2">
        <span className="text-volt">🔊</span>
        <h2 className="font-display text-lg font-bold tracking-wide text-mist">{channel.name}</h2>
      </div>

      {error && (
        <p className="border-l-2 border-plasma bg-plasma/10 px-3 py-2 text-sm text-plasma">{error}</p>
      )}
      {goLiveError && (
        <p className="border-l-2 border-plasma bg-plasma/10 px-3 py-2 text-sm text-plasma">
          {goLiveError}
        </p>
      )}

      {!connectedHere && (
        <button
          onClick={handleConnect}
          disabled={connectingHere}
          className="bevel bg-volt px-8 py-3 font-display text-sm font-bold tracking-[0.15em] text-void transition hover:bg-volt-soft disabled:opacity-50"
        >
          {connectingHere ? 'CONECTANDO…' : 'CONECTAR'}
        </button>
      )}

      {connectedHere && (
        <>
          <ul className="flex w-full max-w-sm flex-col gap-1.5">
            {participants.map((p) => {
              const isMe = p.userId === currentUserId
              const muted = isMe ? localMuted : p.muted
              const deafened = isMe ? localDeafened : p.deafened
              const video = isMe ? videoEnabled : p.video
              const live = isParticipantLive(p.userId)
              // "Falando agora" de verdade (nível de áudio, ver
              // webrtc/SpeakingDetector.ts) — não só "não mutado".
              const speaking = !muted && speakingUserIds.has(p.userId)

              return (
                <li
                  key={p.userId}
                  onContextMenu={(e) => {
                    if (!isMe) openVolumeMenu(e, { kind: 'mic', peerId: p.userId })
                  }}
                  title={!isMe ? 'Botão direito: ajustar volume' : undefined}
                  className={`bevel-sm flex items-center justify-between border px-3.5 py-2.5 text-sm transition ${
                    speaking ? 'border-volt/60 bg-panel glow-volt' : 'border-line bg-panel text-mist-dim'
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium text-mist">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        speaking ? 'animate-pulse-live bg-volt' : 'bg-mist-faint'
                      }`}
                    />
                    {participantName(p.userId)}
                  </span>
                  <span className="flex items-center gap-1.5 text-mist-dim">
                    {live && (
                      <span
                        title="Ao vivo (Go Live)"
                        className="font-mono text-[10px] font-bold tracking-wide text-plasma"
                      >
                        ● LIVE
                      </span>
                    )}
                    {p.screen_sharing && <span title="Compartilhando tela">🖥️</span>}
                    {video && <span title="Câmera ligada">🎥</span>}
                    {deafened && <span title="Ensurdecido">🙉</span>}
                    <span className={muted ? 'text-plasma' : 'text-volt'}>{muted ? '🔇' : '🎙️'}</span>
                  </span>
                </li>
              )
            })}
          </ul>

          <div className="flex flex-wrap justify-center gap-2">
            <VoiceButton onClick={toggleMute} active={localMuted} activeLabel="ATIVAR MIC" label="MUTAR" />
            <VoiceButton
              onClick={toggleDeafen}
              active={localDeafened}
              activeLabel="REATIVAR ÁUDIO"
              label="ENSURDECER"
            />
            <VoiceButton
              onClick={() => toggleVideo()}
              active={videoEnabled}
              activeLabel="DESLIGAR CÂMERA"
              label="LIGAR CÂMERA"
              disabled={videoCapReached}
              title={videoCapReached ? 'Limite de 4 participantes com vídeo atingido nessa sala' : undefined}
            />
            <VoiceButton
              onClick={() => (screenSharing ? stopScreenShare() : setPickerTarget('screen'))}
              active={screenSharing}
              activeLabel="PARAR TELA"
              label="COMPARTILHAR TELA"
            />
            {screenSharing && screenShareQuality && (
              <ScreenShareQualityMenu quality={screenShareQuality} onChange={updateScreenShareQuality} />
            )}
            <VoiceButton
              onClick={() => (isLive ? stopGoLive() : setPickerTarget('golive'))}
              active={isLive}
              activeLabel="PARAR TRANSMISSÃO"
              label="IR AO VIVO"
              disabled={goLiveStatus !== 'connected' && !isLive}
              title={goLiveStatus !== 'connected' ? 'Conectando ao Go Live…' : undefined}
            />
            <button
              onClick={handleLeave}
              className="bevel-sm border border-plasma/60 bg-plasma/10 px-4 py-2 font-display text-xs font-bold tracking-wide text-plasma transition hover:bg-plasma/20"
            >
              SAIR
            </button>
          </div>

          {localCameraStream && <RemoteVideo stream={localCameraStream} label="Sua câmera" muted />}
          {Object.entries(remoteCameraStreams).map(([peerId, stream]) => (
            <RemoteVideo key={peerId} stream={stream} label={participantName(peerId)} />
          ))}

          {screenShares.length === 1 && (
            <div
              className="w-full"
              onContextMenu={(e) => {
                if (screenShares[0].id !== currentUserId) {
                  openVolumeMenu(e, { kind: 'screen', peerId: screenShares[0].id })
                }
              }}
            >
              <RemoteVideo
                stream={screenShares[0].stream}
                label={
                  screenShares[0].id === currentUserId
                    ? 'Você está compartilhando a tela'
                    : `${screenShares[0].label} está compartilhando a tela`
                }
                muted={screenShares[0].id === currentUserId || localPlaybackMuted}
                volume={remoteScreenVolumes[screenShares[0].id] ?? 1}
                large
              />
            </div>
          )}
          {screenShares.length > 1 && (
            <ScreenShareGrid
              shares={screenShares}
              currentUserId={currentUserId}
              localPlaybackMuted={localPlaybackMuted}
              remoteVolumes={remoteScreenVolumes}
              onVolumeContext={(e, peerId) => openVolumeMenu(e, { kind: 'screen', peerId })}
            />
          )}

          {localLiveStream && (
            <RemoteVideo stream={localLiveStream} label="● Você está ao vivo" muted live large />
          )}
          <GoLiveStreams
            participants={goLiveParticipants.filter((p) => p.live && p.userId !== currentUserId)}
            remoteStreams={remoteLiveStreams}
            watchingUserIds={watchingUserIds}
            localPlaybackMuted={localPlaybackMuted}
            remoteVolumes={remoteGoLiveVolumes}
            watchStream={watchStream}
            stopWatchingStream={stopWatchingStream}
            participantName={participantName}
            onVolumeContext={(e, peerId) => openVolumeMenu(e, { kind: 'golive', peerId })}
          />

          {Object.entries(remoteAudioStreams).map(([peerId, stream]) => (
            <RemoteAudio
              key={peerId}
              stream={stream}
              // v1.6.0, bug real reportado: `localPlaybackMuted` entrava
              // aqui também, deixando quem transmite com som do PC incapaz
              // de ouvir a própria call — a call é a única coisa que a
              // pessoa realmente precisa continuar ouvindo enquanto
              // transmite. Efeito colateral aceito conscientemente: a voz
              // dela na call agora entra na captura de loopback igual a
              // qualquer outro som do PC, então quem estiver assistindo E
              // na mesma call pode ouvir um leve eco com atraso da própria
              // voz do streamer — mitigável abaixando o volume dessa
              // transmissão especificamente (botão direito na tela/
              // transmissão), não vale travar a call pra evitar isso.
              muted={localDeafened}
              volume={remoteMicVolumes[peerId] ?? 1}
            />
          ))}
        </>
      )}

      {volumeMenu && volumeMenuValue !== null && (
        <VolumeMenu
          x={volumeMenu.x}
          y={volumeMenu.y}
          volume={volumeMenuValue}
          onChange={handleVolumeMenuChange}
          onClose={() => setVolumeMenu(null)}
        />
      )}

      {pickerTarget && (
        <ScreenSharePicker
          showQuality={pickerTarget === 'screen'}
          onSelect={(sourceId, quality, includeAudio) => {
            const target = pickerTarget
            setPickerTarget(null)
            if (target === 'screen') startScreenShare(sourceId, quality, includeAudio)
            else startGoLive(sourceId, includeAudio)
          }}
          onCancel={() => setPickerTarget(null)}
        />
      )}
    </div>
  )
}

function VoiceButton({
  onClick,
  active,
  activeLabel,
  label,
  disabled,
  title
}: {
  onClick: () => void
  active: boolean
  activeLabel: string
  label: string
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`bevel-sm border px-4 py-2 font-display text-xs font-bold tracking-wide transition disabled:opacity-40 ${
        active
          ? 'border-plasma/60 bg-plasma/10 text-plasma hover:bg-plasma/20'
          : 'border-line bg-panel text-mist-dim hover:border-mist-dim hover:text-mist'
      }`}
    >
      {active ? activeLabel : label}
    </button>
  )
}

// Trocar resolução/fps já compartilhando — abre um popover com as mesmas
// opções do ScreenSharePicker (sem o passo de escolher a fonte de novo,
// já está compartilhando). onChange chama updateScreenShareQuality, que
// recaptura a mesma fonte nos novos parâmetros por baixo dos panos.
function ScreenShareQualityMenu({
  quality,
  onChange
}: {
  quality: ScreenShareQuality
  onChange: (quality: ScreenShareQuality) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const currentLabel = RESOLUTIONS.find((res) => res.width === quality.width)?.label ?? `${quality.height}p`

  // Fecha só ao clicar fora, não ao tirar o mouse de cima — o popover é
  // `absolute` (fora do fluxo normal), então a caixa do `relative` abaixo
  // não cobre o vão visual até ele; um `onMouseLeave` nesse vão fechava o
  // menu antes da pessoa conseguir mover o mouse até a opção e clicar
  // (reportado ao vivo pelo usuário).
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="bevel-sm border border-line bg-panel px-4 py-2 font-display text-xs font-bold tracking-wide text-mist-dim transition hover:border-mist-dim hover:text-mist"
      >
        {currentLabel} · {quality.frameRate}FPS ⚙
      </button>

      {open && (
        <div className="bevel-sm absolute bottom-full left-0 z-10 mb-2 w-56 space-y-2 border border-line-soft bg-panel-2 p-3 shadow-2xl shadow-black/50">
          <div>
            <p className="mb-1 font-mono text-[10px] tracking-[0.2em] text-mist-dim">RESOLUÇÃO</p>
            <div className="flex gap-1">
              {RESOLUTIONS.map((res) => (
                <button
                  key={res.label}
                  onClick={() => onChange({ ...quality, width: res.width, height: res.height })}
                  className={`flex-1 border px-2 py-1 font-mono text-xs transition ${
                    quality.width === res.width
                      ? 'border-volt bg-volt/10 text-volt'
                      : 'border-line text-mist-dim hover:text-mist'
                  }`}
                >
                  {res.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 font-mono text-[10px] tracking-[0.2em] text-mist-dim">TAXA DE QUADROS</p>
            <div className="flex gap-1">
              {FRAME_RATES.map((fps) => (
                <button
                  key={fps}
                  onClick={() => onChange({ ...quality, frameRate: fps })}
                  className={`flex-1 border px-2 py-1 font-mono text-xs transition ${
                    quality.frameRate === fps
                      ? 'border-volt bg-volt/10 text-volt'
                      : 'border-line text-mist-dim hover:text-mist'
                  }`}
                >
                  {fps} FPS
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Transmissões dos outros (Go Live) — assistir agora é uma escolha, não
// automático (v1.3.0, a pedido do usuário): quem está ao vivo aparece como
// um cartão compacto com "ENTRAR"; só depois desse clique é que o vídeo/
// áudio de verdade começa a chegar (goLiveStore.watchStream faz o
// setSubscribed(true) real no LiveKit, não só abre a UI). "SAIR" desinscreve
// de verdade. A própria transmissão (localLiveStream) continua renderizando
// direto, sem esse passo — ver acima.
function GoLiveStreams({
  participants,
  remoteStreams,
  watchingUserIds,
  localPlaybackMuted,
  remoteVolumes,
  watchStream,
  stopWatchingStream,
  participantName,
  onVolumeContext
}: {
  participants: { userId: string }[]
  remoteStreams: Record<string, MediaStream>
  watchingUserIds: Set<string>
  localPlaybackMuted: boolean
  remoteVolumes: Record<string, number>
  watchStream: (peerId: string) => void
  stopWatchingStream: (peerId: string) => void
  participantName: (userId: string) => string
  onVolumeContext: (e: React.MouseEvent, peerId: string) => void
}) {
  if (participants.length === 0) return null

  return (
    <div className="w-full space-y-3">
      {participants.map((p) => {
        const watching = watchingUserIds.has(p.userId)
        const stream = remoteStreams[p.userId]

        if (watching && stream) {
          return (
            <div
              key={p.userId}
              className="w-full space-y-1.5"
              onContextMenu={(e) => onVolumeContext(e, p.userId)}
            >
              <RemoteVideo
                stream={stream}
                label={`● ${participantName(p.userId)} está ao vivo`}
                muted={localPlaybackMuted}
                volume={remoteVolumes[p.userId] ?? 1}
                live
                large
              />
              <button
                onClick={() => stopWatchingStream(p.userId)}
                className="bevel-sm border border-line bg-panel px-3 py-1.5 font-mono text-xs tracking-wide text-mist-dim transition hover:border-plasma/60 hover:text-plasma"
              >
                SAIR DA TRANSMISSÃO
              </button>
            </div>
          )
        }

        return (
          <div
            key={p.userId}
            className="bevel-sm flex w-full items-center justify-between border border-plasma/60 bg-plasma/10 px-4 py-3"
          >
            <span className="font-mono text-xs font-bold tracking-wide text-plasma">
              ● {participantName(p.userId)} está ao vivo
            </span>
            <button
              onClick={() => watchStream(p.userId)}
              className="bevel-sm bg-plasma px-4 py-1.5 font-display text-xs font-bold tracking-[0.1em] text-void transition hover:bg-plasma-soft"
            >
              ENTRAR
            </button>
          </div>
        )
      })}
    </div>
  )
}

// Duas ou mais pessoas compartilhando tela ao mesmo tempo: em vez de
// empilhar tudo em vídeos gigantes um embaixo do outro, mostra uma só em
// destaque (grande) e o resto como miniaturas clicáveis — a pessoa escolhe
// quem fica em evidência, sem perder de vista que as outras também estão
// compartilhando.
function ScreenShareGrid({
  shares,
  currentUserId,
  localPlaybackMuted,
  remoteVolumes,
  onVolumeContext
}: {
  shares: { id: string; stream: MediaStream; label: string }[]
  currentUserId: string
  localPlaybackMuted: boolean
  remoteVolumes: Record<string, number>
  onVolumeContext: (e: React.MouseEvent, peerId: string) => void
}) {
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const focused = shares.find((s) => s.id === focusedId) ?? shares[0]
  const isOwnFocused = focused.id === currentUserId

  return (
    <div className="w-full space-y-2">
      <div
        onContextMenu={(e) => {
          if (!isOwnFocused) onVolumeContext(e, focused.id)
        }}
      >
        <RemoteVideo
          stream={focused.stream}
          label={isOwnFocused ? 'Você está compartilhando a tela' : `${focused.label} está compartilhando a tela`}
          muted={isOwnFocused || localPlaybackMuted}
          volume={remoteVolumes[focused.id] ?? 1}
          large
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {shares.map((share) => (
          <button
            key={share.id}
            onClick={() => setFocusedId(share.id)}
            className={`bevel-sm shrink-0 overflow-hidden border transition ${
              share.id === focused.id ? 'border-volt' : 'border-line hover:border-mist-dim'
            }`}
          >
            {/* Sempre mudo — só a tela em destaque acima toca áudio, senão
                cada miniatura tocaria por cima (cacofonia com 2+ pessoas
                compartilhando com som, v1.4.0). */}
            <ThumbnailVideo stream={share.stream} />
            <p className="w-32 truncate bg-panel-2 px-1.5 py-1 text-left font-mono text-[10px] text-mist-dim">
              {share.id === currentUserId ? 'Você' : share.label}
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}

function ThumbnailVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])

  return <video ref={ref} autoPlay muted className="h-20 w-32 bg-black object-cover" />
}

// `HTMLMediaElement.volume` só aceita [0, 1] (nativamente não existe
// "boost" acima de 100% — isso precisaria de um GainNode via Web Audio
// API, não construído aqui) — clamp defensivo, não só o slider capado em
// 100% abaixo, porque um valor já salvo antes dessa correção (ou algum
// caminho futuro que reintroduza >100%) não pode voltar a derrubar o app.
function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, volume))
}

function RemoteAudio({
  stream,
  muted,
  volume = 1
}: {
  stream: MediaStream
  muted?: boolean
  volume?: number
}) {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])

  // `volume` não é um atributo HTML de verdade (é só propriedade do
  // elemento) — o React não reflete isso de forma confiável via prop JSX,
  // então precisa aplicar via ref igual ao srcObject acima. `HTMLMediaElement
  // .volume` só aceita [0, 1] — atribuir fora disso lança DOMException (não
  // clampa sozinho); sem isso, um valor > 1 derrubava a árvore inteira do
  // React (sem error boundary no app) — bug real reportado pelo usuário,
  // ver clampVolume/VolumeMenu abaixo.
  useEffect(() => {
    if (ref.current) ref.current.volume = clampVolume(volume)
  }, [volume])

  return <audio ref={ref} autoPlay muted={muted} />
}

function RemoteVideo({
  stream,
  label,
  muted,
  volume = 1,
  live,
  large
}: {
  stream: MediaStream
  label: string
  muted?: boolean
  volume?: number
  live?: boolean
  // Câmera/Go Live ficam num tamanho compacto fixo (max-w-2xl) — tela
  // compartilhada usa `large` pra preencher a largura do painel em vez de
  // ficar presa nesses 672px, e continua responsiva porque o limite some,
  // não vira um tamanho fixo maior.
  large?: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])

  useEffect(() => {
    if (ref.current) ref.current.volume = clampVolume(volume)
  }, [volume])

  return (
    <div className={`w-full ${large ? '' : 'max-w-2xl'}`}>
      <p className={`mb-1 font-mono text-[11px] tracking-wide ${live ? 'text-plasma' : 'text-mist-dim'}`}>
        {label}
      </p>
      <video
        ref={ref}
        autoPlay
        muted={muted}
        className={`bevel w-full border bg-black ${live ? 'border-plasma/60' : 'border-line'}`}
      />
    </div>
  )
}

// Menu de contexto de volume (botão direito) — slider 0–100%. Fecha só ao
// clicar fora (não por mouseleave) — mesmo motivo já documentado em
// ScreenShareQualityMenu: sendo `fixed`/fora do fluxo, um mouseleave no
// vão até o slider fecharia cedo demais.
//
// v1.6.0, bug real reportado (app crashava ao mexer no volume de outra
// pessoa): a primeira versão ia até 200% ("boost", estilo Discord), mas
// `HTMLMediaElement.volume` só aceita [0, 1] — atribuir um valor > 1
// lança `DOMException`, e sem error boundary nenhum no app isso derrubava
// a árvore inteira do React (tela em branco). Fazer o boost de verdade
// precisaria de um `GainNode` via Web Audio API por elemento — escopo bem
// maior que o pedido original ("poder mudar o volume"); capado em 100%
// em vez disso, que é exatamente o que a API nativa já suporta sem exigir
// nenhuma peça nova.
function VolumeMenu({
  x,
  y,
  volume,
  onChange,
  onClose
}: {
  x: number
  y: number
  volume: number
  onChange: (volume: number) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  const percent = Math.round(volume * 100)

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="bevel-sm fixed z-50 w-56 space-y-2 border border-line-soft bg-panel-2 p-3 shadow-2xl shadow-black/50"
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] tracking-[0.2em] text-mist-dim">VOLUME</p>
        <p className="font-mono text-xs text-mist">{percent}%</p>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={percent}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full accent-volt"
      />
    </div>
  )
}

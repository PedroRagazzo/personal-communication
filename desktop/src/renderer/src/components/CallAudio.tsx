import { useEffect, useRef } from 'react'
import { useVoiceStore } from '../stores/voiceStore'

// Áudio da call (mic de cada participante) — montado pela HomePage, não
// pelo VoicePanel (v1.8.0). Antes vivia dentro do VoicePanel, que só existe
// com o canal de voz selecionado: abrir um canal de texto no meio da call
// desmontava todos os <audio> e a pessoa parava de ouvir todo mundo (os
// outros continuavam ouvindo ela). Tela/Go Live continuam no VoicePanel —
// sair da tela do canal pra esses é esperado.
export function CallAudio() {
  const remoteAudioStreams = useVoiceStore((s) => s.remoteAudioStreams)
  const remoteMicVolumes = useVoiceStore((s) => s.remoteMicVolumes)
  const localDeafened = useVoiceStore((s) => s.localDeafened)

  return (
    <>
      {Object.entries(remoteAudioStreams).map(([peerId, stream]) => (
        <RemoteAudio
          key={peerId}
          stream={stream}
          // v1.6.0, bug real reportado: `localPlaybackMuted` entrava aqui
          // também, deixando quem transmite com som do PC incapaz de ouvir
          // a própria call. Efeito colateral aceito: a voz de quem transmite
          // entra na captura de loopback, então quem assiste E está na mesma
          // call pode ouvir um leve eco — mitigável abaixando o volume dessa
          // transmissão (botão direito), não vale travar a call por isso.
          muted={localDeafened}
          volume={remoteMicVolumes[peerId] ?? 1}
        />
      ))}
    </>
  )
}

// `HTMLMediaElement.volume` só aceita [0, 1] — atribuir fora disso lança
// DOMException, e sem error boundary no app isso derrubava a árvore inteira
// do React (bug real, v1.6.0). Clamp defensivo em todo `.volume =`, não só
// o slider capado em 100% (ver VolumeMenu em VoicePanel.tsx).
export function clampVolume(volume: number): number {
  return Math.min(1, Math.max(0, volume))
}

function RemoteAudio({ stream, muted, volume = 1 }: { stream: MediaStream; muted?: boolean; volume?: number }) {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])

  // `volume` é só propriedade do elemento, não atributo HTML — o React não
  // aplica isso de forma confiável via prop JSX, precisa ser via ref.
  useEffect(() => {
    if (ref.current) ref.current.volume = clampVolume(volume)
  }, [volume])

  return <audio ref={ref} autoPlay muted={muted} />
}

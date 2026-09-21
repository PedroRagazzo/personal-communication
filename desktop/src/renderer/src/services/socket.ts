import { Socket } from 'phoenix'

// Um socket por sessão autenticada — Channels (chat, voz, Go Live) entram
// nele conforme o usuário navega. Token vai como connect param (`?token=`),
// nunca header: é como o backend autentica WebSocket (docs/security.md).
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'ws://localhost:4000/socket'

let socket: Socket | null = null
let currentToken: string | null = null

// `params` como função (não objeto estático): o access token dura só 15min
// (AuthController.tokens/1) e uma sessão de voz/chat pode ficar aberta muito
// mais que isso. Se o socket cair por qualquer motivo (rede, deploy no
// servidor) e reconectar sozinho — o cliente `phoenix` faz isso — precisa
// pegar o token mais recente na hora, não o que estava fixo desde a conexão
// original. `authStore.ts` mantém isso atualizado via `updateSocketToken`
// num refresh periódico, sem precisar derrubar a conexão em uso pra isso.
export function connectSocket(accessToken: string): Socket {
  currentToken = accessToken
  socket?.disconnect()
  socket = new Socket(SOCKET_URL, { params: () => ({ token: currentToken }) })
  socket.connect()
  return socket
}

export function updateSocketToken(accessToken: string): void {
  currentToken = accessToken
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
  currentToken = null
}

export function getSocket(): Socket | null {
  return socket
}

import { Socket } from 'phoenix'

// Um socket por sessão autenticada — Channels (chat, voz, Go Live) entram
// nele conforme o usuário navega. Token vai como connect param (`?token=`),
// nunca header: é como o backend autentica WebSocket (docs/security.md).
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'ws://localhost:4000/socket'

let socket: Socket | null = null

export function connectSocket(accessToken: string): Socket {
  socket?.disconnect()
  socket = new Socket(SOCKET_URL, { params: { token: accessToken } })
  socket.connect()
  return socket
}

export function disconnectSocket(): void {
  socket?.disconnect()
  socket = null
}

export function getSocket(): Socket | null {
  return socket
}

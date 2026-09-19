// Cliente REST fino contra o backend (docs/api.md). Sem estado aqui — quem
// guarda tokens e orquestra refresh é `stores/authStore.ts`.
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1'

export class ApiError extends Error {
  status: number
  errors: unknown

  constructor(status: number, errors: unknown) {
    super(flattenErrors(errors))
    this.status = status
    this.errors = errors
  }
}

export function flattenErrors(errors: unknown): string {
  if (errors && typeof errors === 'object') {
    const obj = errors as Record<string, unknown>
    if (typeof obj.detail === 'string') return obj.detail

    const parts = Object.entries(obj).flatMap(([field, messages]) =>
      Array.isArray(messages) ? messages.map((message) => `${field} ${message}`) : []
    )
    if (parts.length > 0) return parts.join('; ')
  }
  return 'falha na requisição'
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  })

  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new ApiError(res.status, body.errors)
  }

  return body as T
}

export interface AuthUser {
  id: string
  username: string
  discriminator: string
  email: string | null
  display_name: string | null
}

export interface AuthTokens {
  access_token: string
  refresh_token: string
  user: AuthUser
}

// Cadastro pede só usuário+senha — email é opcional no backend (guardado
// pra uma fatia futura de confirmação/recuperação de senha) mas o cliente
// nunca pede/mostra isso.
export function register(username: string, password: string): Promise<AuthTokens> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ user: { username, password } })
  })
}

// Login usa username#discriminator, não email — é o caminho raro de
// recriar a sessão (o normal é a sessão persistir via secureStorage).
export function login(username: string, discriminator: string, password: string): Promise<AuthTokens> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, discriminator, password })
  })
}

export function refresh(refreshToken: string): Promise<{ access_token: string }> {
  return request('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken })
  })
}

export function logout(refreshToken: string): Promise<void> {
  return request('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken })
  })
}

export interface Me {
  id: string
  username: string
  discriminator: string
  email: string
  display_name: string | null
  status: string
}

export function me(accessToken: string): Promise<Me> {
  return request('/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
}

export interface ServerSummary {
  id: string
  name: string
  icon_url: string | null
  owner_id: string
}

export function listServers(accessToken: string): Promise<ServerSummary[]> {
  return request<{ servers: ServerSummary[] }>('/servers', {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then((res) => res.servers)
}

export interface ChannelSummary {
  id: string
  name: string
  topic: string | null
  type: string
  position: number
}

export function listChannels(accessToken: string, serverId: string): Promise<ChannelSummary[]> {
  return request<{ channels: ChannelSummary[] }>(`/servers/${serverId}/channels`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then((res) => res.channels)
}

export function createChannel(
  accessToken: string,
  serverId: string,
  params: { name: string; type: 'guild_text' | 'guild_voice' }
): Promise<ChannelSummary> {
  return request<{ channel: ChannelSummary }>(`/servers/${serverId}/channels`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ channel: params })
  }).then((res) => res.channel)
}

export interface ServerMember {
  id: string
  nickname: string | null
  joined_at: string
  user: { id: string; username: string; discriminator: string }
  roles: { id: string; name: string }[]
}

export function listMembers(accessToken: string, serverId: string): Promise<ServerMember[]> {
  return request<{ members: ServerMember[] }>(`/servers/${serverId}/members`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then((res) => res.members)
}

export interface MessageReaction {
  emoji: string
  count: number
  user_ids: string[]
}

export interface ChatMessage {
  id: string
  channel_id: string
  author_id: string
  content: string
  reply_to_id: string | null
  edited_at: string | null
  inserted_at: string
  reactions: MessageReaction[]
}

export function listMessages(accessToken: string, channelId: string): Promise<ChatMessage[]> {
  return request<{ messages: ChatMessage[] }>(`/channels/${channelId}/messages`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then((res) => res.messages)
}

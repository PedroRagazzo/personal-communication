import { create } from 'zustand'
import * as api from '../services/api'
import { connectSocket, disconnectSocket, updateSocketToken } from '../services/socket'
import { useServersStore } from './serversStore'
import { useChatStore } from './chatStore'

const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'

// Access token dura 15min (AuthController.tokens/1) — renova a cada 10 pra
// sobrar margem. Sem isso, qualquer sessão de voz/chat aberta por mais
// tempo que isso ficava com o token vencido assim que o socket precisasse
// reconectar (queda de rede, deploy no servidor), travando em
// "Conectando…" pra sempre (handshake do WS rejeitado com 403 — achado ao
// vivo num app de verdade, não em teste automatizado).
const TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000

let refreshTimer: ReturnType<typeof setInterval> | null = null

function startTokenRefreshLoop(refreshToken: string): void {
  stopTokenRefreshLoop()
  refreshTimer = setInterval(async () => {
    try {
      const { access_token } = await api.refresh(refreshToken)
      await window.api.secureStorage.set(ACCESS_TOKEN_KEY, access_token)
      updateSocketToken(access_token)
      useAuthStore.setState({ accessToken: access_token })
    } catch (err) {
      // 401 = refresh token mesmo inválido/revogado (não uma falha de rede
      // passageira) — só nesse caso força logout; outros erros só tentam
      // de novo no próximo ciclo.
      if (err instanceof api.ApiError && err.status === 401) {
        useAuthStore.getState().logout()
      }
    }
  }, TOKEN_REFRESH_INTERVAL_MS)
}

function stopTokenRefreshLoop(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
}

interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  user: api.Me | null
  accessToken: string | null
  error: string | null
  bootstrap: () => Promise<void>
  register: (username: string, password: string) => Promise<void>
  login: (username: string, password: string, discriminator?: string) => Promise<void>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  user: null,
  accessToken: null,
  error: null,

  // Roda no boot do app: tenta validar o token guardado; se o access token
  // expirou (401), tenta um refresh antes de desistir e pedir login de novo.
  // Tudo dentro de um try/catch amplo por design: qualquer erro inesperado
  // aqui (inclusive `window.api` ausente, o que não deveria acontecer dentro
  // do Electron de verdade, só fora dele) deve cair pra tela de login, nunca
  // deixar a UI travada em "Carregando…" pra sempre.
  bootstrap: async () => {
    try {
      const [accessToken, refreshToken] = await Promise.all([
        window.api.secureStorage.get(ACCESS_TOKEN_KEY),
        window.api.secureStorage.get(REFRESH_TOKEN_KEY)
      ])

      if (!accessToken || !refreshToken) {
        set({ status: 'unauthenticated' })
        return
      }

      try {
        const user = await api.me(accessToken)
        connectSocket(accessToken)
        startTokenRefreshLoop(refreshToken)
        set({ status: 'authenticated', user, accessToken })
        return
      } catch (err) {
        if (err instanceof api.ApiError && err.status === 401) {
          const { access_token } = await api.refresh(refreshToken)
          const user = await api.me(access_token)
          await window.api.secureStorage.set(ACCESS_TOKEN_KEY, access_token)
          connectSocket(access_token)
          startTokenRefreshLoop(refreshToken)
          set({ status: 'authenticated', user, accessToken: access_token })
          return
        }
        throw err
      }
    } catch (err) {
      console.error('falha ao restaurar sessão', err)
      await clearStoredTokens().catch(() => {})
      set({ status: 'unauthenticated' })
    }
  },

  register: async (username, password) => {
    set({ error: null })
    try {
      const tokens = await api.register(username, password)
      await persistAndSetAuthenticated(tokens)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'erro desconhecido' })
      throw err
    }
  },

  login: async (username, password, discriminator) => {
    set({ error: null })
    try {
      const tokens = await api.login(username, password, discriminator)
      await persistAndSetAuthenticated(tokens)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'erro desconhecido' })
      throw err
    }
  },

  logout: async () => {
    stopTokenRefreshLoop()
    const refreshToken = await window.api.secureStorage.get(REFRESH_TOKEN_KEY)
    if (refreshToken) {
      await api.logout(refreshToken).catch(() => {})
    }
    await clearStoredTokens()
    useChatStore.getState().reset()
    useServersStore.getState().reset()
    disconnectSocket()
    set({ status: 'unauthenticated', user: null, accessToken: null })
  }
}))

async function clearStoredTokens(): Promise<void> {
  await Promise.all([
    window.api.secureStorage.delete(ACCESS_TOKEN_KEY),
    window.api.secureStorage.delete(REFRESH_TOKEN_KEY)
  ])
}

async function persistAndSetAuthenticated(tokens: api.AuthTokens): Promise<void> {
  await Promise.all([
    window.api.secureStorage.set(ACCESS_TOKEN_KEY, tokens.access_token),
    window.api.secureStorage.set(REFRESH_TOKEN_KEY, tokens.refresh_token)
  ])
  // Busca o perfil completo via /users/me (inclui `status`, que o payload de
  // tokens não traz) em vez de confiar no `user` parcial do register/login.
  const user = await api.me(tokens.access_token)
  connectSocket(tokens.access_token)
  startTokenRefreshLoop(tokens.refresh_token)
  useAuthStore.setState({ status: 'authenticated', accessToken: tokens.access_token, user })
}

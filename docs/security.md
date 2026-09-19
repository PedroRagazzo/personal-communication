# Segurança — TORA DOS BURRO

Regra que atravessa tudo: **nunca confiar no cliente.** Toda permissão é validada no servidor, revalidada a cada ação — nunca a partir de uma claim vinda do cliente.

## Transporte

- TLS (HTTPS/WSS) para toda sinalização e API.
- **DTLS-SRTP** protege a mídia WebRTC em si — camada separada da TLS acima; não assumir que "TLS em tudo" cobre o transporte de áudio/vídeo/tela.

## Autenticação

- Hash de senha com **argon2id** (`argon2_elixir`) — não bcrypt. É a recomendação atual para projeto novo, sem motivo de compatibilidade legada para preferir bcrypt.
- **Guardian** (JWT) para access token (curta duração, ex. 15 min) + **`guardian_db`** para refresh token persistido, revogável e rotacionado a cada uso — Guardian sozinho é stateless e não revoga nada sem essa segunda lib.
- Autenticação de WebSocket via **connect param**, não header — navegadores não permitem headers customizados no handshake WS, então o token vai na URL/params de conexão do Channel.
- Cliente Electron guarda tokens via keychain do SO (`safeStorage`), não em `localStorage` puro. **Implementado (FASE 11)**: só o processo `main` chama `safeStorage`/grava em disco (`app.getPath('userData')`); o `preload` só troca IPC (`secure-storage:get/set/delete`), o `renderer` nunca vê `safeStorage` nem o arquivo diretamente.
- Electron nega toda permissão de navegador por padrão sem um handler explícito. **Implementado (FASE 11, fatia 4)**: `session.setPermissionCheckHandler`/`setPermissionRequestHandler` no `main` liberam só `'media'` e `'display-capture'` (microfone e compartilhamento de tela) — qualquer outra permissão (localização, notificações, etc.) fica negada por padrão.
- **`sandbox: true` (preload) só aceita CommonJS, nunca ESM.** Achado na FASE 11 fatia 5: o preload sandboxado do Electron recusa `.mjs` com `SyntaxError: Cannot use import statement outside a module` — silenciosamente, só no console da própria janela (nunca apareceu testando fora do Electron). `electron.vite.config.ts` força `output: { format: 'cjs' }` no bloco `preload` por causa disso. Nunca "resolver" isso desligando `sandbox` — a causa é só formato de build, desligar o sandbox trocaria uma fronteira de segurança real por conveniência de build à toa.
- Confirmação de email e recuperação de senha via token de uso único com expiração.

## Autorização

- Toda ação em canal/servidor passa por checagem de `roles` (bitfield de permissões) + `permission_overwrites` específicas do canal, sempre no servidor, sempre no momento da ação (não só no `join`).
- Ações de moderação (kick/ban/delete de mensagem de terceiro) exigem permissão explícita, nunca implícita por "ser autor".

## Rede / WebRTC

- **coturn** com credenciais **temporárias via TURN REST API** (`use-auth-secret` + segredo compartilhado) — nunca usuário/senha estático, que transforma o TURN num relay aberto explorável por terceiros. Ver `docker/coturn/turnserver.conf`.

## Validação de entrada

- Toda entrada validada via Ecto changesets.
- Upload de anexos (FASE 4, leve no MVP): allowlist de `content_type`, limite de tamanho, nunca confiar na extensão do arquivo isoladamente.
- Rate limiting via `Hammer` (backend ETS no MVP; Redis-backed quando houver cluster, FASE 15) — aplicado em login, criação de mensagem, criação de convite, e outras rotas sensíveis a abuso/spam.

## Auditoria

- `audit_log` (ver `database.md`) registra ações de moderação (ban, kick, delete por moderador, mudança de cargo) com ator, alvo, ação e metadata.
- `reports` (ver `database.md`) como stub para denúncias de usuário/mensagem — UI pode vir depois, mas a estrutura de dados existe desde já.

## Segredos

- Segredos (chave de assinatura do Guardian, segredo do TURN, credenciais de storage, API key/secret do LiveKit) via variáveis de ambiente/config em runtime, nunca commitados no repositório. Em desenvolvimento, o LiveKit roda em modo `--dev` com credenciais fixas (`devkey`/`secret`) — nunca usar esse modo em produção (ver `docs/media.md`).
- `docker-compose.yml` cobre só desenvolvimento local. Gestão de segredos em produção (vault ou secret manager da plataforma de deploy escolhida) é escopo formal da FASE 16, mesmo que ainda não implementada no MVP.

## Observabilidade como sinal de segurança

`:telemetry` + `Phoenix.LiveDashboard` desde a FASE 1, e logging estruturado — falhas de ICE/WebRTC, picos de rate limit e erros de autorização são, na prática, o principal sinal de abuso em um sistema realtime como este.

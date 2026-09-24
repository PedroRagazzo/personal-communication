# API — REST + WebSocket

Convenção: toda rota REST sob `/api/v1` desde o início (versionamento leve, só o prefixo — sem construir infraestrutura de versionamento além disso até haver uma mudança que realmente quebre compatibilidade).

Esta é a superfície inicial planejada por fase — **os detalhes de request/response de cada endpoint são definidos na implementação da fase correspondente**, não aqui (regra do projeto: não escrever tudo de uma vez).

## FASE 1 — Health check

```
GET /api/v1/health → { "status": "ok" }
```

## FASE 2 — Autenticação

Implementado. `email` é **opcional** no cadastro (o cliente hoje só pede usuário+senha — sessão persistida localmente via `safeStorage` cobre o dia a dia; login é o caminho de recuperação, e por isso usa `username#discriminator`, não email, já que o cliente nunca chega a pedir/guardar isso). O campo continua existindo no schema para uma fatia futura de confirmação/recuperação de senha por email.

```
POST /api/v1/auth/register   body: { user: { username, password, email? } }
POST /api/v1/auth/login      body: { username, discriminator, password }
POST /api/v1/auth/refresh    body: { refresh_token }
POST /api/v1/auth/logout     body: { refresh_token }
```

`password/forgot`, `password/reset` e `confirm/:token` do documento original ficam para quando confirmação de email/recuperação de senha entrarem (ver `docs/roadmap.md`) — não implementados.

## FASE 2–3 — Usuários

```
GET   /api/v1/users/me
PATCH /api/v1/users/me
GET   /api/v1/users/:id
```

## FASE 3 — Servidores, membros, cargos, convites

Implementado. Ajustes em relação ao rascunho original: atribuir/remover cargo
virou dois verbos idempotentes (`PUT`/`DELETE` num sub-recurso `roles/:role_id`)
em vez de um único `PUT` substituindo a lista inteira; `POST .../bans` recebe
`user_id` no corpo (não há sub-recurso de usuário alvo antes do ban existir).

```
GET    /api/v1/servers                                                (só os que o usuário é membro — FASE 11)
POST   /api/v1/servers
GET    /api/v1/servers/:id
PATCH  /api/v1/servers/:id
DELETE /api/v1/servers/:id
POST   /api/v1/servers/:id/leave

GET    /api/v1/servers/:server_id/members
DELETE /api/v1/servers/:server_id/members/:user_id                    (kick)
PUT    /api/v1/servers/:server_id/members/:user_id/roles/:role_id     (atribuir cargo)
DELETE /api/v1/servers/:server_id/members/:user_id/roles/:role_id     (remover cargo)

POST   /api/v1/servers/:server_id/bans        (body: user_id, reason)
DELETE /api/v1/servers/:server_id/bans/:user_id

GET    /api/v1/servers/:server_id/roles
POST   /api/v1/servers/:server_id/roles
PATCH  /api/v1/servers/:server_id/roles/:id
DELETE /api/v1/servers/:server_id/roles/:id

POST   /api/v1/servers/:server_id/invites
GET    /api/v1/invites/:code           (público, não exige login nem ser membro)
POST   /api/v1/invites/:code/join
```

Permissões (bitfield em `roles.permissions`, ver `ToraDosBurro.Servers.Permissions`):
`view_channels`, `send_messages`, `manage_messages`, `connect`, `speak`,
`create_invite`, `kick_members`, `ban_members`, `manage_roles`,
`manage_channels`, `manage_server`, `administrator`. Todo servidor ganha um
cargo `@everyone` (`is_default: true`) na criação, com um subconjunto seguro
por padrão; o dono do servidor sempre tem acesso total, independente de cargo.
`permission_overwrites` (exceção por canal) ficou para a FASE 5, quando canais
passaram a existir de verdade — já implementado, ver seção da FASE 5 abaixo.

## FASE 4 — Canais mínimos e mensagens (núcleo implementado)

Canal precisa existir para mensagem ter onde morar, então a criação básica de
canal (só `guild_text`) entrou aqui, não esperou a FASE 5. Mutações de
mensagem acontecem só via WebSocket (`message:create` etc., ver
`realtime.md`); REST cobre canal (CRUD) e histórico/paginação.

```
GET    /api/v1/servers/:server_id/channels
POST   /api/v1/servers/:server_id/channels
PATCH  /api/v1/servers/:server_id/channels/:id
DELETE /api/v1/servers/:server_id/channels/:id

GET    /api/v1/channels/:channel_id/messages?before=&limit=   (paginação por cursor)
```

**Pendente** (próxima fatia desta mesma fase, precisa de MinIO rodando):
```
POST /api/v1/channels/:id/attachments   (retorna URL pré-assinada para upload direto)
```

## FASE 5 — Categorias, canal de voz (metadados) e permissões por canal

Implementado. `guild_voice` já existe como tipo de canal criável (estrutura),
mas a mecânica de voz de verdade (entrar na sala, WebRTC) só chega na FASE 6.
Não existe flag `is_private` — um canal fica "privado" via
`permission_overwrite` negando `view_channels` para o cargo `@everyone`.
Reordenar é só fazer `PATCH` no campo `position` (de canal ou categoria) —
sem endpoint de "mover em lote" nesta fase.

```
GET    /api/v1/servers/:server_id/categories
POST   /api/v1/servers/:server_id/categories
PATCH  /api/v1/servers/:server_id/categories/:id
DELETE /api/v1/servers/:server_id/categories/:id

GET    /api/v1/channels/:channel_id/permission_overwrites
PUT    /api/v1/channels/:channel_id/permission_overwrites
       (body: target_type ["role"|"member"], target_id, allow, deny — upsert)
DELETE /api/v1/channels/:channel_id/permission_overwrites/:target_type/:target_id
```

Resolução de permissão por canal (`ToraDosBurro.Channels.channel_permissions/3`,
mesma ordem do Discord): permissão efetiva do servidor → overwrite de
`@everyone` → overwrite dos outros cargos do membro → overwrite do membro
específico (vale por último). `administrator` ignora overwrites por completo;
dono do servidor sempre passa, sem checar overwrite nenhum.

## WebSocket — tópicos de Channel

Ver `realtime.md` e `media.md` para o detalhamento de cada tópico.

| Tópico | Uso |
|---|---|
| `channel:{channel_id}` | Chat de texto em tempo real |
| `voice:{channel_id}` | Sinalização de voz/vídeo/tela (SDP, ICE) |
| `live:{channel_id}` | Go Live (FASE 9) — emite tokens do LiveKit, nunca SDP/ICE (mídia vai direto ao SFU) |
| `server:{server_id}` | Presença agregada do servidor — quem está online e em qual canal de voz (v1.8.0), mais `member:joined` (v1.6.0) |
| `user:{user_id}` | Eventos pessoais (pós-MVP: DM, notificações) |

## FASE 9 — Go Live

Sem endpoint REST — tudo via WebSocket, canal precisa ser `guild_voice`. Nova permissão `:stream` (padrão para membros comuns, ver `ToraDosBurro.Servers.Permissions`). Ver `docs/media.md` para o formato do token e a decisão de SFU (LiveKit).

```
join "live:{channel_id}"     → autoriza :connect, devolve {token, url} (subscriber-only)
golive:start                 → autoriza :stream, devolve {token, url} (publisher)
golive:stop                  → volta a subscriber; sem resposta de token
```

## Fora do MVP (mencionado para não ser esquecido, não para implementar agora)

```
Amigos / DM        → GET/POST /api/v1/friends, /api/v1/friends/requests, POST /api/v1/dms
```

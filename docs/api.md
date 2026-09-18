# API — REST + WebSocket

Convenção: toda rota REST sob `/api/v1` desde o início (versionamento leve, só o prefixo — sem construir infraestrutura de versionamento além disso até haver uma mudança que realmente quebre compatibilidade).

Esta é a superfície inicial planejada por fase — **os detalhes de request/response de cada endpoint são definidos na implementação da fase correspondente**, não aqui (regra do projeto: não escrever tudo de uma vez).

## FASE 1 — Health check

```
GET /api/v1/health → { "status": "ok" }
```

## FASE 2 — Autenticação

```
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/password/forgot
POST /api/v1/auth/password/reset
GET  /api/v1/auth/confirm/:token
```

## FASE 2–3 — Usuários

```
GET   /api/v1/users/me
PATCH /api/v1/users/me
GET   /api/v1/users/:id
```

## FASE 3 — Servidores, membros, cargos, convites

```
POST   /api/v1/servers
GET    /api/v1/servers/:id
PATCH  /api/v1/servers/:id
DELETE /api/v1/servers/:id
POST   /api/v1/servers/:id/leave

GET    /api/v1/servers/:id/members
DELETE /api/v1/servers/:id/members/:user_id        (kick)
PUT    /api/v1/servers/:id/members/:user_id/roles   (atribuir/remover cargos)

POST   /api/v1/servers/:id/bans
DELETE /api/v1/servers/:id/bans/:user_id

GET    /api/v1/servers/:id/roles
POST   /api/v1/servers/:id/roles
PATCH  /api/v1/servers/:id/roles/:role_id
DELETE /api/v1/servers/:id/roles/:role_id

POST   /api/v1/servers/:id/invites
GET    /api/v1/invites/:code
POST   /api/v1/invites/:code/join
```

## FASE 4 — Mensagens e anexos

Mutações em tempo real acontecem via Channel (`message:create` etc., ver `realtime.md`); REST cobre histórico/paginação e upload.

```
GET  /api/v1/channels/:id/messages?before=&limit=   (paginação por cursor)
POST /api/v1/channels/:id/attachments                (retorna URL para anexar na mensagem)
```

Upload de anexos usa a abstração `ObjectStorage` — endpoint retorna uma URL (presigned, quando o provider suportar) em vez de proxyar os bytes pelo Phoenix.

## FASE 5 — Canais e categorias

```
GET    /api/v1/servers/:id/channels
POST   /api/v1/servers/:id/channels
PATCH  /api/v1/servers/:id/channels/:channel_id
DELETE /api/v1/servers/:id/channels/:channel_id

GET    /api/v1/servers/:id/categories
POST   /api/v1/servers/:id/categories
PATCH  /api/v1/servers/:id/categories/:category_id
```

## WebSocket — tópicos de Channel

Ver `realtime.md` e `media.md` para o detalhamento de cada tópico.

| Tópico | Uso |
|---|---|
| `channel:{channel_id}` | Chat de texto em tempo real |
| `voice:{channel_id}` | Sinalização de voz/vídeo/tela (SDP, ICE) |
| `server:{server_id}` | Presença agregada do servidor |
| `user:{user_id}` | Eventos pessoais (pós-MVP: DM, notificações) |

## Fora do MVP (mencionado para não ser esquecido, não para implementar agora)

```
Amigos / DM        → GET/POST /api/v1/friends, /api/v1/friends/requests, POST /api/v1/dms
Go Live            → endpoints de FASE 9, dependem da escolha de SFU (ver media.md)
```

# Realtime — Phoenix Channels, eventos e presença

Este documento cobre o transporte de **controle e sinalização em tempo real** (texto, presença, digitação, e o canal de sinalização usado pela voz/vídeo). O transporte de mídia em si (áudio/vídeo/tela via WebRTC) está em `media.md`.

## Tópicos de Channel

| Tópico | Uso | Fase |
|---|---|---|
| `channel:{channel_id}` | Chat de texto: mensagens, edição, exclusão, reações, digitação | FASE 4 |
| `voice:{channel_id}` | Sinalização de voz/vídeo/tela (SDP, ICE) — nunca mídia em si | FASE 6 |
| `server:{server_id}` | Presença agregada do servidor (quem está online) | FASE 4/6 |
| `user:{user_id}` | Eventos pessoais (notificações; DM quando essa feature entrar pós-MVP) | pós-MVP |

Toda `join/3` de Channel autentica (token Guardian) e autoriza (roles + `permission_overwrites` do canal) antes de aceitar — nunca confiar em permissão alegada pelo cliente.

## Fluxo de mensagens

```
Client
   │ WebSocket → Phoenix Channel "channel:{id}"
   ▼
join → autentica (token) + autoriza (roles/permission_overwrites)
   │
   ├── message:create   → valida (Ecto changeset) → persiste → broadcast
   ├── message:update   → autoriza (autor OU permissão de moderação) → persiste → broadcast
   ├── message:delete   → idem
   ├── message:reaction → persiste → broadcast
   ├── typing:start / typing:stop → broadcast efêmero (não persiste)
   └── presence:update  → via Phoenix.Presence
```

Histórico é paginado por cursor (`inserted_at`/`id`), carregado sob demanda (REST — ver `api.md` — não via Channel).

## Eventos (nomenclatura)

```
message:create
message:update
message:delete
message:reaction
typing:start
typing:stop
presence:update
```

## Presença

`Phoenix.Presence` é a fonte da verdade para "quem está online" e "quem está em qual canal de voz" — é um CRDT replicado nativamente entre nós do cluster BEAM (sem dependência de Redis para isso; Redis só entra quando `Phoenix.PubSub` precisar de um adapter cross-node, na FASE 15). Nada relacionado a presença é escrito em tabela — é estado de sessão, não histórico.

## Observabilidade

`:telemetry` + `Phoenix.LiveDashboard` configurados desde a FASE 1 (builtin do Phoenix, custo de setup baixo) para visibilidade de conexões de Channel, latência e taxa de eventos — antes mesmo de haver tráfego real, para não ter que instrumentar retroativamente depois de um incidente.

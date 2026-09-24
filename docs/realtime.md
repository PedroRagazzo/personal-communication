# Realtime — Phoenix Channels, eventos e presença

Este documento cobre o transporte de **controle e sinalização em tempo real** (texto, presença, digitação, e o canal de sinalização usado pela voz/vídeo). O transporte de mídia em si (áudio/vídeo/tela via WebRTC) está em `media.md`.

## Tópicos de Channel

| Tópico | Uso | Fase |
|---|---|---|
| `channel:{channel_id}` | Chat de texto: mensagens, edição, exclusão, reações, digitação | FASE 4 — `message:create`/histórico (fatia 3), edição/exclusão/reação (fatia 8) **implementados no cliente**; `typing:start`/`stop` ainda só no backend |
| `voice:{channel_id}` | Sinalização de voz/vídeo/tela (SDP, ICE) — nunca mídia em si | FASE 6 |
| `server:{server_id}` | Presença agregada do servidor: quem está online (meta `online_at`, rastreada pelo `ServerChannel`) e, desde a v1.8.0, quem está em cada canal de voz (meta `voice_channel_id` com a mesma chave `user_id`, rastreada pelo próprio processo do `VoiceChannel` — some sozinha quando a pessoa sai da call ou cai); também `member:joined` (v1.6.0) | FASE 4/6, v1.2.0+ |
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
   ├── message:reaction:remove → persiste → broadcast (idempotente)
   ├── typing:start / typing:stop → broadcast efêmero (não persiste)
   └── presence:update  → via Phoenix.Presence
```

Histórico é paginado por cursor (`seq` — bigserial monotônico, não `inserted_at`/`id`: UUID não é ordenável e a resolução de clock do SO não é fina o bastante pra desempatar mensagens no mesmo milissegundo, ver `database.md`), carregado sob demanda (REST — ver `api.md` — não via Channel).

## Lado do cliente (FASE 11)

`stores/chatStore.ts` entra no tópico junto com `join` do canal de texto selecionado (fatia 3) e escuta os broadcasts pra manter `messages` em sincronia — nenhuma mutação é otimista (igual a `message:create` desde a fatia 3): o cliente só atualiza o estado local quando o próprio broadcast volta do servidor, mesmo pra quem disparou a ação, então author e demais membros sempre convergem pro mesmo estado.

**Fatia 8** (editar/apagar/reagir mensagem): `message:update`/`message:delete` só mostram os controles de UI (`ChatView.tsx`) pra quem é autor da mensagem (`author_id === currentUserId`) — moderar mensagem de outra pessoa via `manage_messages` já funciona no backend (ver `authorize_message_edit/2` em `chat_channel.ex`) mas ainda não tem entrada na UI, fica pra uma fatia futura. `message:reaction`/`message:reaction:remove` mandam só a reação que mudou (`{message_id, emoji, user_id}`), não o resumo agregado inteiro de novo — o cliente aplica a mudança incrementalmente no array `reactions` de cada mensagem (agrupado por emoji, igual ao `MessageJSON.reaction_summary/1` do backend). `message:reaction:remove` é um evento **novo desta fatia**: `Chat.remove_reaction/3` já existia no contexto desde a FASE 4, mas nunca tinha sido exposto no Channel — só existia o "add".

## Eventos (nomenclatura)

```
message:create
message:update
message:delete
message:reaction
message:reaction:remove
typing:start
typing:stop
presence:update
```

## Presença

`Phoenix.Presence` é a fonte da verdade para "quem está online" e "quem está em qual canal de voz" — é um CRDT replicado nativamente entre nós do cluster BEAM (sem dependência de Redis para isso; Redis só entra quando `Phoenix.PubSub` precisar de um adapter cross-node, na FASE 15). Nada relacionado a presença é escrito em tabela — é estado de sessão, não histórico.

## Observabilidade

`:telemetry` + `Phoenix.LiveDashboard` configurados desde a FASE 1 (builtin do Phoenix, custo de setup baixo) para visibilidade de conexões de Channel, latência e taxa de eventos — antes mesmo de haver tráfego real, para não ter que instrumentar retroativamente depois de um incidente.

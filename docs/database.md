# Modelo de dados — TORA DOS BURRO

Banco: PostgreSQL via Ecto. Este é o modelo inicial (FASE 0); migrations reais são criadas incrementalmente a partir da FASE 2.

## Decisões de modelagem

- **DM e canais de servidor compartilham o mesmo schema.** Em vez de duas árvores paralelas (`channels` vs `dm_channels`), uma única tabela `channels` com `type` (`guild_text` | `guild_voice` | `dm` | `group_dm`), `server_id` opcional, e uma tabela `channel_recipients` para participantes de DM/grupo. Evita duplicar mensagens/anexos/reações em dois sistemas — é como plataformas reais desse tipo modelam DMs.
- **Permissões como bitfield** (`permissions bigint`) direto em `roles`, mais uma tabela `permission_overwrites` para exceções por canal (permissão de cargo/membro específica sobrescrita naquele canal) — sem isso não há como expressar um recurso central de plataformas Discord-like.
- Tabela de junção `member_roles` explícita — um membro pode ter vários cargos.
- `read_states` para "não lido" — barato agora, caro de adicionar depois de já haver histórico de mensagens em produção.
- `audit_log` com alvo polimórfico via `target_type` (string) + `target_id` (binary_id), **sem foreign key nativa** no alvo — Ecto não tem associação polimórfica nativa como Rails; a integridade referencial do alvo é responsabilidade da aplicação, não do banco.
- `position` (inteiro) em `categories` e `channels` desde o início, para permitir reordenar por arrastar-e-soltar sem precisar migrar para índice fracionário depois.
- Estado de voz (mute/deafen/"está no canal X") fica **efêmero em `Phoenix.Presence`** (replicado no cluster BEAM via CRDT), nunca persistido em tabela — é estado de sessão, não histórico.
- Senha nunca em texto puro — hash com **argon2id** (ver `security.md`).

## Entidades

| Entidade | Campos-chave | Observação |
|---|---|---|
| `users` | id, username, discriminator, email, password_hash, display_name, avatar_url, status, custom_status_text, last_seen_at | perfil embutido no `User` no MVP (bio, banner) — sem `UserProfile` separada a menos que justifique |
| `guardian_tokens` | (tabela gerenciada pela lib `guardian_db`) | necessária para revogar/rotacionar refresh tokens — Guardian sozinho é stateless |
| `servers` | id, name, owner_id, icon_url | "guild" no vocabulário Discord |
| `server_members` | id, server_id, user_id, nickname, joined_at | |
| `roles` | id, server_id, name, color, permissions (bigint), position, is_default | bitfield de permissões |
| `member_roles` | server_member_id, role_id | N:N |
| `permission_overwrites` | id, channel_id, target_type [role\|member], target_id, allow (bigint), deny (bigint) | exceções por canal |
| `categories` | id, server_id, name, position | |
| `channels` | id, server_id?, category_id?, type, name, topic, position | unifica canais de servidor e DM |
| `channel_recipients` | channel_id, user_id | participantes de DM/group DM |
| `messages` | id, channel_id, author_id, content, reply_to_id?, edited_at? | |
| `message_attachments` | id, message_id, object_key, filename, content_type, size_bytes | via abstração `ObjectStorage` (MinIO local / S3-R2 produção) |
| `message_reactions` | id, message_id, user_id, emoji | |
| `read_states` | user_id, channel_id, last_read_message_id, updated_at | badges de "não lido" |
| `friend_requests` | id, requester_id, addressee_id, status [pending\|accepted\|declined\|blocked] | schema pronto; feature fora do MVP |
| `invites` | id, code, server_id, creator_id, max_uses, uses, expires_at | |
| `bans` | id, server_id, user_id, moderator_id, reason | |
| `reports` | id, reporter_id, target_type [message\|user], target_id, reason, status | stub para denúncias/moderação |
| `audit_log` | id, server_id, actor_id, action, target_type, target_id, metadata (jsonb) | alvo sem FK nativa (ver acima) |

## O que NÃO fica no PostgreSQL

- Arquivos/anexos: só metadados na tabela `message_attachments`; bytes ficam no Object Storage (`ObjectStorage` behaviour, MinIO local / S3-compatível em produção).
- Estado de voz/presença: `Phoenix.Presence`, efêmero.
- Sessões de digitação (`typing:start/stop`): efêmero, broadcast direto, nunca persistido.

## Dependências relacionadas

- `ecto_sql` + `postgrex`
- `guardian_db` (persistência/revogação de tokens do Guardian — ver `security.md`)

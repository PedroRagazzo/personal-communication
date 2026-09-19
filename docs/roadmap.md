# Roadmap por fases

Regra fundamental: **não avançar para uma fase sem verificar se a anterior está funcional.** Cada fase é uma resposta explicando objetivo/arquivos/arquitetura/dependências/fluxo de dados **antes** de implementar (ver processo de desenvolvimento abaixo).

```
FASE 0  → Arquitetura                        [CONCLUÍDA]
FASE 1  → Backend básico (Phoenix, health check)                        [CONCLUÍDA — v0.1.0]
FASE 2  → Autenticação (Guardian, argon2id, guardian_db)                [CONCLUÍDA — v0.2.0]
FASE 3  → Usuários e servidores (roles, permissões, convites, bans)     [CONCLUÍDA — v0.3.0]
FASE 4  → Chat em tempo real (núcleo — anexos leves pendentes)          [NÚCLEO CONCLUÍDO — v0.4.0-core]
FASE 5  → Canais (categorias, permissões por canal)                    [CONCLUÍDA — v0.5.0]
FASE 6  → Voz (mesh WebRTC, sinalização, Presence)                     [CONCLUÍDA — v0.6.0]
FASE 7  → Vídeo (câmera, MediaSession, cap de 4 participantes)         [CONCLUÍDA — v0.7.0]
FASE 8  → Compartilhamento de tela (desktopCapturer, 1 por vez)        [CONCLUÍDA — v0.8.0]
──────────────────────────────────────────── fim do MVP (backend) ────
        → Amigos / Mensagens Diretas (fast-follow — schema já pronto na FASE 3/4)
FASE 9  → Go Live (SFU: LiveKit — ver media.md)                        [CONCLUÍDA (backend) — v0.9.0]
FASE 10 → Arquivos — gestão avançada (redefinida, ver nota abaixo)
FASE 11 → Cliente Electron (empacotamento, distribuição)          [EM ANDAMENTO — fatia 1: scaffold + auth, v0.10.0]
FASE 12 → Rust (media services — redirecionado pela adoção de SFU na FASE 9, ver media.md)
FASE 13 → C++ (media engine nativo, chamado a partir do Rust)
FASE 14 → Python / Machine Learning (analytics, moderação automática)
FASE 15 → Escalabilidade (libcluster, Redis PubSub adapter, SFU independente)
FASE 16 → Segurança (hardening de produção, gestão de segredos, TLS real no coturn)
FASE 17 → SDK (Rust primeiro, depois bindings)
FASE 18 → Testes e produção
```

**"MVP (backend)" concluído** com a FASE 8 (`v0.8.0`): 68 testes passando, cada
fase verificada de ponta a ponta (incluindo com clientes WebSocket reais, não
só a suíte automatizada). O qualificador "(backend)" importa — FASES 6, 7 e 8
implementaram toda a sinalização/autorização/Presence do lado do servidor,
mas a metade client-side (peer connections WebRTC de verdade, perfect
negotiation, STUN/coturn, `desktopCapturer`) depende do Electron e só entra
na FASE 11. Sem um cliente de verdade, ninguém liga microfone/câmera/tela
ainda — só o "esqueleto" que torna isso possível está pronto.

Pendente antes de um MVP completo de ponta a ponta: anexos leves (FASE 4,
precisa de Docker/MinIO), Amigos/DM (fast-follow abaixo), e a FASE 11 em si.

## Correções registradas em relação ao documento original

1. **Anexos de arquivo**: o documento original lista "Uploads" como FASE 10 (depois do Go Live). Anexos **leves** (imagem/arquivo pequeno, com validação) entram na **FASE 4** — chat sem nenhum anexo não é utilizável, e isso evita que a FASE 4 fique "funcional" apenas parcialmente. A FASE 10 passa a significar **gestão avançada de arquivos** (arquivos grandes, upload retomável, cotas, CDN) — um endurecimento pós-MVP, não a introdução do recurso básico.
2. **Amigos/DM**: não aparecia como fase explícita no documento original (schema de `server`/`channel` sugeria isso implicitamente). Fica registrado aqui como **fast-follow logo após a FASE 8** (fora do MVP formal, mas antes da FASE 9), já que o schema (`friend_requests`, `channels.type = dm/group_dm`, `channel_recipients`) é desenhado desde a FASE 3/4 para suportar isso sem retrabalho.
3. **FASE 9 (Go Live)**: decisão de SFU resolvida no kickoff da fase — **LiveKit**, não mediasoup (a recomendação preliminar original) — ver `media.md` para o raciocínio completo. Backend (autorização + emissão de token) implementado e verificado; o lado cliente/mídia real depende do LiveKit rodando (sem Docker neste ambiente) e do Electron (FASE 11).
4. **FASE 11 (Electron)** é grande demais pra uma fatia só (Regra 1) — sendo dividida em fatias dentro da própria fase, cada uma com seu próprio ciclo explicar → implementar → testar: **fatia 1** (scaffold + autenticação, `v0.10.0`) concluída; lista de servidores, socket/presença, chat, voz/vídeo/tela e empacotamento/distribuição ficam para fatias seguintes, nessa ordem aproximada.

## Processo de desenvolvimento (regras do projeto, mantidas)

1. Não escrever código gigante de uma vez.
2. Implementar uma funcionalidade por vez.
3. Antes de implementar, explicar: objetivo, arquivos envolvidos, arquitetura, dependências, fluxo de dados.
4. Depois implementar.
5. Depois criar testes.
6. Depois explicar como executar.
7. Não inventar APIs ou bibliotecas.
8. Verificar compatibilidade entre versões.
9. Não adicionar dependências sem justificar.
10. Não criar microsserviços prematuramente.
11. Separar Control Plane / Media Plane / Data Plane.
12. Priorizar código simples, modular e sustentável.

Formato de resposta durante o desenvolvimento (a partir da FASE 1): Etapa atual → Objetivo → Arquitetura → Arquivos → Implementação → Banco de dados → Testes → Como executar → Como testar → Próxima etapa (só a próxima, nunca várias fases de uma vez).

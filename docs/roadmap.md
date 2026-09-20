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
FASE 8  → Compartilhamento de tela (desktopCapturer)                   [CONCLUÍDA — v0.8.0, cap revisado após v0.15.0]
──────────────────────────────────────────── fim do MVP (backend) ────
        → Amigos / Mensagens Diretas (schema já pronto na FASE 3/4)     [FORA DE ESCOPO — ver item 8]
FASE 9  → Go Live (SFU: LiveKit — ver media.md)                        [CONCLUÍDA (backend) — v0.9.0]
FASE 10 → Arquivos — gestão avançada (redefinida, ver nota abaixo)     [FORA DE ESCOPO — ver item 8]
FASE 11 → Cliente Electron (empacotamento, distribuição)          [CONCLUÍDA — v0.17.0]
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
precisa de Docker/MinIO) e verificação de mídia real do Go Live contra um
LiveKit rodando (FASE 9, também precisa de Docker). Amigos/DM segue fora de
escopo por decisão do usuário (fast-follow abaixo, não planejado). A FASE 11
(cliente Electron, incluindo empacotamento) está **concluída** (`v0.16.0`).

## Correções registradas em relação ao documento original

1. **Anexos de arquivo**: o documento original lista "Uploads" como FASE 10 (depois do Go Live). Anexos **leves** (imagem/arquivo pequeno, com validação) entram na **FASE 4** — chat sem nenhum anexo não é utilizável, e isso evita que a FASE 4 fique "funcional" apenas parcialmente. A FASE 10 passa a significar **gestão avançada de arquivos** (arquivos grandes, upload retomável, cotas, CDN) — um endurecimento pós-MVP, não a introdução do recurso básico.
2. **Amigos/DM**: não aparecia como fase explícita no documento original (schema de `server`/`channel` sugeria isso implicitamente). Fica registrado aqui como **fast-follow logo após a FASE 8** (fora do MVP formal, mas antes da FASE 9), já que o schema (`friend_requests`, `channels.type = dm/group_dm`, `channel_recipients`) é desenhado desde a FASE 3/4 para suportar isso sem retrabalho. **Fora de escopo pra este deploy** (ver item 8) — o schema continua pronto se um dia fizer sentido, mas não é trabalho planejado.
3. **FASE 9 (Go Live)**: decisão de SFU resolvida no kickoff da fase — **LiveKit**, não mediasoup (a recomendação preliminar original) — ver `media.md` para o raciocínio completo. Backend (autorização + emissão de token) implementado e verificado; o lado cliente/mídia real depende do LiveKit rodando (sem Docker neste ambiente) e do Electron (FASE 11).
4. **FASE 11 (Electron)** é grande demais pra uma fatia só (Regra 1) — sendo dividida em fatias dentro da própria fase, cada uma com seu próprio ciclo explicar → implementar → testar: **fatia 1** (scaffold + autenticação, `v0.10.0`), **fatia 2** (lista de servidores/canais — navegação só leitura, `v0.11.0`, trouxe também o `GET /api/v1/servers` que faltava no backend), **fatia 3** (chat em tempo real — socket, histórico + `message:create` ao vivo, `v0.12.0`), **fatia 4** (voz — mesh WebRTC de verdade com perfect negotiation, `v0.13.0`), **fatia 5** (compartilhamento de tela — `desktopCapturer`, `v0.14.0`, ver `media.md`), **fatia 6** (vídeo/câmera — `v0.15.0`, ver `media.md`), **fatia 7** (deafen — `v0.15.2`, ver `media.md`), **fatia 8** (editar/apagar/reagir mensagem — `v0.15.3`, ver `realtime.md`) e **fatia 9** (criar canal — `v0.15.4`) concluídas; entre a 5 e a 6, o fluxo de autenticação foi simplificado a pedido do usuário (cadastro só usuário+senha, login por `username#discriminator`+senha como caminho de recuperação — sessão persiste sozinha depois do primeiro login, `v0.14.1`, ver `api.md`/`database.md`/`security.md`); logo após a 6, o cap de tela foi revisado (item 7 abaixo, `v0.15.1`). A fatia 8 também expôs `message:reaction:remove` no Channel, evento novo — `Chat.remove_reaction/3` já existia no contexto desde a FASE 4 mas nunca tinha sido exposto. A fatia 9 não mudou nada no backend (`POST /servers/:id/channels` já existia e já era testado desde a FASE 4/5) — só ligou o cliente: form inline na `ChannelList` (nome + tipo texto/voz), qualquer membro vê o botão, servidor sempre revalida `manage_channels` (sem checagem de permissão replicada no cliente, mesmo padrão de vídeo/tela). **Fatia 10** (Go Live, `v0.15.5`) também não mudou o backend (FASE 9 já estava pronta) — `stores/goLiveStore.ts` novo (`livekit-client` oficial) + `VoicePanel.tsx` integrando os controles; achou e corrigiu um bug real de CSP que bloqueava qualquer conexão ao LiveKit (ver item 9 abaixo e `docs/media.md`). **Fatia 11** (empacotamento/distribuição, `v0.16.0`, encerra a FASE 11 inteira) — `electron-builder` (`^26.15.3`) gera um instalador NSIS real (`desktop/electron-builder.yml`); ícone próprio criado do zero (`desktop/build/icon.ico`/`icon.png`, não existia nenhum antes). Só Windows por enquanto — é a única plataforma testável neste ambiente e a que os ~20 usuários do deploy de fato usam; macOS/Linux ficam pra quando (e se) fizer sentido, é só estender o mesmo `electron-builder.yml` com blocos `mac`/`linux`. Sem assinatura de código (precisa de certificado pago, fora de escopo) e sem auto-update (não pedido, mecanismo de publish do electron-builder nem foi configurado) — instalador roda localmente, sem depender de conta/servidor nenhum, e o Windows vai mostrar aviso de "editor desconhecido" no primeiro uso (SmartScreen), o que é esperado pra um instalador não assinado. **Fatia 12** (`v0.17.0`, não planejada originalmente — descoberta ao criar o servidor único de verdade pra esse deploy): faltava qualquer jeito de **entrar** num servidor existente pelo cliente. "Criar servidor" sempre esteve fora de escopo (item 8 abaixo), mas "entrar via convite" nunca tinha sido discutido nem construído em nenhuma fatia anterior — só apareceu como lacuna real ao tentar efetivamente colocar as ~20 pessoas dentro do servidor "TORA DOS BURRO" (criado direto via API, dono = conta real do usuário, token gerado pelo próprio código de auth do backend sem tocar em senha nenhuma). Backend não mudou (`GET /invites/:code` e `POST /invites/:code/join` já existiam e já eram testados desde a FASE 3) — só ligou o cliente: botão "+" verde no `ServerSidebar` (ao lado dos ícones de servidor) abre um modal (`JoinServerDialog.tsx`, no mesmo estilo do `ScreenSharePicker.tsx`) com um campo pro código; erros do backend (`not found`/`expired`/`max_uses_reached`/`banned`/`already_member`) traduzidos pra mensagens claras, mesmo padrão do 403 de criar canal.
5. **Bug de build corrigido na fatia 5, mas existia desde a fatia 1**: preload sandboxado (`sandbox: true`) não aceita ESM — precisa compilar como CommonJS (`output: { format: 'cjs' }`). Sem isso, `window.api` nunca existia de verdade dentro do Electron real (só parecia "esperado" estar ausente porque toda verificação anterior rodava numa aba de navegador comum, sem preload nenhum). Achado e corrigido só na fatia 5 porque foi a primeira vez que a verificação rodou contra a janela Electron de verdade (via CDP/`--remoteDebuggingPort`) em vez do browser pane. Ver `docs/media.md` e `docs/security.md` para os detalhes.
6. **Dois bugs reais de WebRTC corrigidos na fatia 6** (câmera): um sobre criação antecipada de transceivers colidindo com *glare* na negociação inicial, outro (mais sutil) sobre `presence.onLeave` derrubando peer connections ativas por causa de uma corrida assíncrona no `Phoenix.Presence.handle_diff/2` — nenhum dos dois apareceu nas fatias 4/5 porque só se manifestam com múltiplas tracks de vídeo trocando de estado em sequência. Ver `docs/media.md` (seção "Fluxo de vídeo") para a causa raiz completa de cada um.
7. **FASE 8 revisada logo após a fatia 6**: limite de 1 compartilhamento de tela por vez removido (`v0.15.1`) a pedido explícito do usuário, que definiu o escopo real de deploy deste app — **um único servidor, uso privado por ~20 pessoas conhecidas, nunca público**. O motivo original do limite (cada compartilhamento simultâneo é mais uma faixa de vídeo que todo peer do mesh precisa decodificar) continua tecnicamente válido e não foi resolvido, só aceito conscientemente dado esse escopo — não é uma mudança segura de generalizar para um deploy público ou salas maiores. O cap de vídeo por câmera (4 simultâneos) foi mantido como estava — a revisão foi só pra compartilhamento de tela. Ver `docs/media.md` ("Limites do mesh").
8. **Escopo do deploy confirmado pelo usuário após a fatia 6**: um único servidor, uso privado por ~20 pessoas conhecidas, nunca público (mesma decisão do item 7). Consequências registradas aqui: **Amigos/DM** (item 2) e **FASE 10** (gestão avançada de arquivos, item 1) saem do que está planejado — sem múltiplos servidores, DM entre servidores diferentes não faz sentido, e sem usuários desconhecidos/externos, os endurecimentos de FASE 10 (cotas, CDN, upload retomável em escala) não têm motivo. **"Criar servidor" no cliente também sai de escopo** — o servidor único já existe, criado direto via API; "criar canal" (dentro dele) continua como trabalho válido, é um recurso menor e independente. Anexos **leves** (FASE 4, ainda pendente — precisa de Docker/MinIO) não foram excluídos, só a versão avançada (FASE 10).
9. **Bug real de CSP corrigido na fatia 10 (Go Live)**: a `Content-Security-Policy` do cliente (`desktop/src/renderer/index.html`) nunca liberava `connect-src` para a URL do LiveKit — nenhum host, nem um esquema genérico — então `room.connect()` do `livekit-client` falhava **sempre**, em qualquer ambiente (não só aqui, sem Docker), com uma mensagem genérica indistinguível de "servidor fora do ar". Só apareceu inspecionando o console do DevTools ao vivo (evento `securitypolicyviolation`), não em `npm run typecheck` nem lendo o código — a própria razão de o processo exigir teste ao vivo, não só checagem estática. Como a URL do LiveKit é dinâmica (entregue pelo backend em runtime via `LIVEKIT_URL`, nunca fixa no build do cliente), a correção libera esquemas (`ws:`/`wss:`/`http:`/`https:` para o `:7880` local + `wss:`/`https:` genéricos para produção), não um host específico. Ver `docs/media.md` (seção "Fluxo do Go Live") para o detalhe completo, incluindo o segundo bloqueio (preflight HTTP `.../validate`) descoberto ao corrigir o primeiro.

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

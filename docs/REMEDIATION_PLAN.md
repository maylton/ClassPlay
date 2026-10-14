# Plano de correções — segurança, integridade e geração de jogos

Base analisada: commit `4bd1497` (v0.6.0). Este plano organiza as correções em fases curtas, cada uma
entregável sozinha, da mais barata e urgente para a mais estrutural.

Legenda: `[ ]` pendente · `[~]` em andamento · `[x]` concluído

---

## Fase 0 — Preparação do ambiente

Necessária antes de aplicar qualquer migration em produção.

- [x] Instalar Node.js (22+) e Git na máquina de desenvolvimento.
- [x] Trabalhar numa branch (`agent/remediation-phase-1`, etc.) — o CI já roda em `agent/**`.
- [x] Banco local para testar migrations: substituído pelo Postgres embutido de `npm run test:db` (sem Docker).
- [x] Backup do banco de produção antes de cada migration (exportação JSON em `Projetos/classplay-backups/`).

---

## Fase 1 — Correções rápidas de alto impacto `[x]`

Mudanças pequenas, sem alterar a arquitetura. Migration: `0023_phase1_integrity_fixes.sql`.

**Status:** concluída. Migration aplicada em produção em 13/10/2026; código na `main` (PR #28).

- [x] `npm run test:remediation` (novo script `scripts/test-remediation-phase1.mjs`)
- [x] `typecheck`, `lint`, `build` e todas as suítes existentes passando
- [x] Comportamento do banco testado em Postgres real (`npm run test:db`). Contra as migrations antigas, o
      teste reproduz os bugs: o erro no Dynamite **adiantava** o relógio em vez de atrasar, e espaços
      repetidos não eram unificados.
- [x] Aplicar `0023_phase1_integrity_fixes.sql` no Supabase (com backup)
- [ ] Conferir os critérios de aceite abaixo manualmente (teste no navegador)

| # | Problema | Correção | Arquivos |
|---|----------|----------|----------|
| 1.1 | **Redirecionamento aberto** no login: `?next=//site-malicioso.com` passava na checagem `startsWith("/")`. | Helper `safeNextPath()` que resolve o caminho contra uma origem fixa e só aceita caminhos da própria origem. | `src/lib/safe-redirect.ts`, `src/app/auth/page.tsx`, `src/app/auth/callback/route.ts` |
| 1.2 | **Biblioteca mostrava atividades de outros professores**: `listActivities()` não filtrava por dono e a RLS libera toda atividade `unlisted`. | Filtrar por `owner_id = user.id`. | `src/lib/repositories/activity-repository.ts` |
| 1.3 | **Aluno removido voltava à turma** só usando o código (o upsert fazia `active = true`). | A RPC recusa a entrada de quem foi desativado pelo professor. | migration 0023 |
| 1.4 | **Penalidade do Dynamite anulada**: o trigger `set_round_started_at` sobrescrevia `round_started_at` sempre que `current_question` mudava. | O trigger só reinicia o relógio quando a identidade da pergunta muda (`itemId`, `index`, `dynamiteTurnId`, `wildcardTileNumber`); atualizações dentro do turno mantêm o relógio que gravaram. | migration 0023 |
| 1.5 | **Marcador de lacuna inconsistente** (2, 3 ou 5 underscores conforme o módulo): a lacuna digitada pelo professor era ignorada ou o item sumia do Gap Fill. | Qualquer sequência de 2+ `_` é aceita e normalizada para `_____` ao salvar e ao gerar o jogo. | `src/lib/activity-intelligence.ts` |
| 1.6 | **`classplay_normalize` não juntava espaços** (`'\\s+'` procurava o texto literal `\s`) e não tratava o apóstrofo curvo `’` do iOS. | Regex corrigida e apóstrofos normalizados. | migration 0023 |

**Critérios de aceite**
- `/auth/callback?next=//exemplo.com` redireciona para `/dashboard`.
- Professor A não vê atividades do professor B no dashboard, nas turmas nem no seletor da Comunidade.
- Aluno desativado recebe “You were removed from this class…” ao tentar entrar de novo.
- No Dynamite, após um erro, `round_started_at` no banco fica 3s no passado (não volta para `now()`).
- `She ___ to school.` (3 underscores) aparece como item jogável no Gap Fill.

**Readmitir aluno:** resolvido na Fase 2 (item 2.3).

---

## Fases 2 e 3 — Moderação, integridade e modo ao vivo confiável `[x]`

Branch `agent/remediation-phase-2-3` (empilhada sobre a Fase 1). Migration:
`0024_phase2_3_moderation_and_live_sync.sql`.

**Status:** concluídas. Migration aplicada em produção em 13/10/2026; código na `main` (PR #28).

- [x] `typecheck`, `lint`, `build` e todas as suítes passando
- [x] `npm run test:remediation` (inclui `scripts/test-remediation-phase2-3.mjs`)
- [x] `npm run test:db`: regras novas testadas em Postgres real
- [x] Aplicar `0023` e depois `0024` no Supabase, com backup
- [ ] Teste manual numa sala ao vivo com 2–3 celulares (ver critérios abaixo)

**Ordem de implantação:** aplicar a migration **antes** de publicar o código. Se o código chegar primeiro,
quase tudo continua funcionando, mas o ranking final no celular do aluno fica vazio até a migration entrar.

### Fase 2 — o que mudou

| # | Problema | O que foi feito | Onde |
|---|----------|-----------------|------|
| 2.1 | Ranking de prática aceitava qualquer nota e qualquer nome; o professor não conseguia apagar. | Trigger no banco: filtro de nomes, teto plausível (`correct ≤ nº de itens`, `score ≤ 3000 × acertos`, `total ≤ 1000`) e limites de inundação (60 notas/min por atividade; 5 notas em 5 min por nome e jogo). Professor dono pode apagar entradas pelo botão **Moderate scores**, ao lado do link de prática. | migration 0024, `LeaderboardModerationPanel.tsx`, `GameHub.tsx`, `leaderboard-repository.ts` |
| 2.2 | Nota de tarefa sem verificação; prazo ignorado. | Mesmos tetos na RPC `submit_assignment_attempt`. Entrega após `due_at` é aceita, mas marcada com `submitted_late`. O professor vê “N late” na tarefa e o aluno vê o aviso no resultado. | migration 0024, `ClassDetailClient.tsx`, `AssignmentPlayerClient.tsx` |
| 2.3 | Não havia como readmitir aluno removido. | Lista recolhível “N removed students” com botão **Readmit**. | `ClassDetailClient.tsx`, `classroom-repository.ts` |
| 2.4 | Salas criadas com atividade de outro professor; contas de aluno podiam hospedar. | Políticas restritivas em `game_sessions` (insert e update): a atividade tem de ser do host, e conta de aluno ou anônima não hospeda. | migration 0024 |
| 2.5 | Entrada em sala sem limites. | Limite de 100 jogadores, filtro de apelidos, e um apelido removido pelo professor não volta à mesma sala. Também vale para o username de contas de aluno. | migration 0024 |
| 2.6 | Miniatura do dashboard nunca aparecia. | A referência `storage:` é convertida em URL assinada antes de ir para o CSS. | `DashboardClient.tsx` |

**Lista de palavras bloqueadas:** fica na tabela `private.blocked_terms` (pt/en/es). Dá para incluir termos
pelo SQL Editor sem nova migration: `insert into private.blocked_terms(term) values ('palavra');`
(apenas letras minúsculas sem acento). Use `match_anywhere = true` só para termos que nunca aparecem
dentro de nomes comuns.

**Limitações conhecidas**
- O “banimento” é por apelido; um aluno pode entrar com outro nome. Para bloquear de vez, use
  **Lock room** depois que todos entrarem.
- Limite por IP não é possível dentro do Postgres; se virar problema, precisa de uma Edge Function.
- Os tetos de pontuação são generosos de propósito (nenhum jogo passa de ~1.500 pontos por acerto).
  Eles barram notas absurdas, não trapaças pequenas; para isso, a pontuação teria de ser calculada no
  servidor.

### Fase 3 — o que mudou

| # | Problema | O que foi feito | Onde |
|---|----------|-----------------|------|
| 3.1 | Qualquer aluno podia mandar `question`, `reveal`, `final` etc. para os outros celulares. | O celular trata todo evento do professor como um **aviso** e relê o estado oficial pela RPC `resume_classplay_player`, que agora também devolve o ranking final. Nada do conteúdo do broadcast é usado. | `StudentJoinClient.tsx`, `live-sync.ts`, migration 0024 |
| 3.2 | Inundação de eventos fazia o host refazer 4 consultas por evento. | Atualizações em segundo plano agrupadas: no máximo uma a cada 400 ms no host e 300 ms no aluno, nunca simultâneas. | `HostRoomClient.tsx`, `live-sync.ts` |
| 3.x | A explosão do Dynamite era anunciada antes de ser salva. | O host salva a eliminação e só depois avisa. | `HostRoomClient.tsx` |
| 3.3 | (Opcional) Canais privados. | **Não feito.** Com 3.1, um broadcast forjado só provoca releituras (limitadas). Fica como melhoria futura. | — |

**Efeito colateral esperado:** cada pergunta chega ao celular ~0,1–0,3 s mais tarde, o tempo de uma
consulta ao banco.

**Critérios de aceite**
- Um broadcast forjado pelo console de um aluno (ex.: `final` ou `reveal` falso) não muda a tela de nenhum
  outro aluno.
- Quiz, Gap Fill, Space Blaster, Dynamite (incluindo o “BOOM!”) e Wildcard Grid funcionam normalmente
  com 2–3 celulares, inclusive o ranking final.
- Professor remove “Pedro” no lobby; “Pedro” não consegue entrar de novo na mesma sala.
- Nome ofensivo é recusado no ranking de prática e na entrada da sala.
- Professor apaga uma entrada do ranking pelo **Moderate scores**.
- Entrega depois do prazo aparece como “late”.

---

## Fases 4 e 5 — Privacidade, plataforma e suporte multilíngue `[x]`

Branch `agent/remediation-phase-4-5` (empilhada sobre as Fases 2–3). Migration:
`0025_phase4_5_privacy_and_languages.sql`.

**Status:** concluídas. Migration aplicada em produção em 13/10/2026 (o ensaio no banco real pegou e corrigiu um índice incompatível com imagens embutidas); código na `main` (PR #28). Pendências restantes resolvidas na rodada final, abaixo.

- [x] `typecheck`, `lint`, `build` e todas as suítes passando
- [x] `npm run test:remediation` (inclui `scripts/test-remediation-phase4-5.mjs`)
- [x] `npm run test:db` (inclui `scripts/db/test-db-phase4-5.mjs`). O teste pegou um erro real de SQL
      no `save_activity` antes de ele chegar à produção.
- [x] Aplicar `0023`, `0024` e `0025`, nessa ordem, no Supabase (com backup)
- [ ] Ativar a extensão **pg_cron** (Dashboard → Database → Extensions) e agendar a limpeza (item 4.5):
      `select cron.schedule('classplay-purge-live-sessions', '17 3 * * *', 'select private.purge_expired_live_sessions(90)');`
      Se o pg_cron já estava ativo quando a 0025 rodou, isso já foi feito.
- [x] Tamanho mínimo de senha 8 no Supabase Auth (ajustado pela API na rodada final)
- [ ] Teste manual: abrir um link de prática sem login, editar uma atividade compartilhada, criar uma
      atividade em espanhol e outra em japonês

**Implantação:** o código desta fase continua funcionando se chegar antes da migration. Se a RPC nova
não existir, ele usa o caminho antigo. Mesmo assim, o ideal é aplicar a migration primeiro.

### Fase 4 — o que mudou

| # | Problema | O que foi feito | Onde |
|---|----------|-----------------|------|
| 4.1 | Qualquer pessoa listava pela API todas as atividades com link de prática (com respostas e ID do dono). | Só atividades publicadas na Comunidade são públicas. O link de prática abre pela RPC `get_practice_activity(id)`, que exige o ID exato e não devolve o dono. Ranking de prática e catálogo da Comunidade continuam funcionando. | migration 0025, `activity-repository.ts` |
| 4.2 | Imagens não apareciam no link de prática, na Comunidade, nas tarefas e nas cópias. | Política de storage: uma imagem pode ser vista por quem pode ver uma atividade que a usa. Ao copiar uma atividade de outra pessoa, as imagens são copiadas para a pasta do novo dono (se a cópia falhar, a referência original continua visível). A capa da Comunidade também passou a usar URL assinada. | migration 0025, `media.ts`, `CommunityClient.tsx`, `useResolvedImageUrl.ts` |
| 4.3 | Sem cabeçalhos de segurança. | `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`. **Não** incluí uma CSP completa (scripts/conexões), que pode quebrar o app sem teste no navegador; o próximo passo é publicá-la como `Content-Security-Policy-Report-Only`. | `next.config.ts` |
| 4.4 | Salvar era uma sequência de 5 chamadas sem transação; editar o deck apagava as respostas ao vivo. | RPC `save_activity` em uma única transação, com RLS. Respostas ao vivo ficam com `item_id = null` e guardam o texto da pergunta. | migration 0025, `activity-repository.ts` |
| 4.5 | Dados de alunos menores nunca eram apagados. | Função `private.purge_expired_live_sessions(90)` apaga salas encerradas há mais de 90 dias (com jogadores e respostas), agendada diariamente se o pg_cron estiver ativo. | migration 0025 |
| 4.6 | Professor podia criar senha de 6 caracteres. | Cadastro novo exige 8. O login continua aceitando 6, para não trancar quem já tem conta. | `AuthClient.tsx` |

**Pendências da Fase 4 (decisão de produto ou jurídica):**
- Política de privacidade e termos para uso com menores (LGPD).
- Exportar/excluir os dados de um aluno a pedido.
- O ranking de prática não expira. Decidir se deve.
- Se as escolas precisarem **incorporar** o ClassPlay em outro site (Moodle, Google Sites),
  `frame-ancestors 'none'` impede. Nesse caso, liste os domínios permitidos em `next.config.ts`.

### Fase 5 — o que mudou

| # | Problema | O que foi feito | Onde |
|---|----------|-----------------|------|
| 5.1 | Tudo pressupunha inglês. | Campo **Language taught** no editor (12 idiomas). Leitura em voz alta (flashcards, Echo Chain, celular no ao vivo) usa a voz do idioma, e rótulos como “ENGLISH” mostram o idioma da atividade. A Comunidade mostra o idioma no cartão. | `languages.ts`, `tts.ts`, editor e jogos |
| 5.2 | Typing Rush e Word Hunt não funcionavam fora do alfabeto latino. | Comparação e grade aceitam qualquer escrita. A grade do Word Hunt é preenchida com letras do próprio alfabeto das respostas e não separa caracteres compostos (ex.: が). O gerador de lacunas também passou a reconhecer palavras acentuadas (“está”). | `typing-rush-engine.ts`, `word-hunt-engine.ts`, `english-phrase-matcher.ts` |
| 5.3 | Acentos sempre ignorados. | Opção **Require accents** por atividade (Typing Rush e Word Hunt). | editor, migration 0025 |
| 5.4 | Só uma resposta correta. | Campo **Also accept** por item: vale no Typing Rush, nunca aparece como opção errada (Quiz, Gap Fill, arcades, ao vivo) e o Sentence Builder aceita ordens alternativas. | editor, `game-engine.ts`, jogos |
| 5.5 | Problemas de conteúdo passavam despercebidos. | Painel **Quality check** no editor: respostas repetidas (Matching/Memory ficam ambíguos), resposta visível no prompt ou na dica, distrator que também é correto, item incompleto. São sugestões, não bloqueiam o salvamento. | `activity-quality.ts`, editor |
| 5.6 | “Review again” só pulava o cartão. | O cartão volta para o fim do baralho (até 2 vezes). | `FlashcardsGame.tsx` |
| 5.7 | Regras de elegibilidade duplicadas em TS e SQL. | **Não feito.** A regra SQL foi movida para uma função (`private.practice_score_allowed`), o que facilita unificar depois. | — |

**Bugs encontrados e corrigidos durante a fase**
- Editar uma atividade com link de prática (ou publicada na Comunidade) **desligava o link**: o editor
  sempre salvava `visibility: "private"`.
- Nos campos “separe com |” (distratores, partes da frase), o `|` sumia enquanto se digitava, então era
  impossível cadastrar mais de um valor digitando.

**Limitações conhecidas**
- A geração automática de lacunas a partir do exemplo continua usando a morfologia do inglês
  (go/goes/went). Em outros idiomas ela funciona por correspondência exata da palavra; em idiomas
  sem espaços (japonês, chinês), o professor escreve a lacuna à mão.
- A voz depende das vozes instaladas no dispositivo do aluno.
- Flashcards ainda contam como acerto o que o próprio aluno marca (“Got it”).

---

## Fase 6 — Testes de verdade `[x]`

Os testes atuais conferem trechos de texto no código (regex). Eles passaram mesmo com o bug do item 1.4.

- [x] Base criada: `scripts/db/` sobe um Postgres embutido (PGlite, sem Docker), aplica todas as
      migrations do zero e testa RLS e RPCs com os papéis `anon`/`authenticated` (`npm run test:db`, no CI).
- [x] Ampliar a cobertura de banco: `test-db-phase6.mjs` cobre RLS de turmas/tarefas (professor A × B, membro ×
      não membro, tarefa não publicada), respostas ao vivo (tempo, duplicidade, token forjado, jogador removido),
      exportação e exclusão de conta e as regras unificadas de modos.
- [x] Testes de comportamento para os motores: os testes de remediação executam os motores de verdade
      (digitação, Word Hunt, opções, gerador de lacunas, qualidade, sincronização ao vivo).
- [x] CI aplica todas as migrations do zero a cada push (`npm run test:db`, Postgres embutido).

---

## Rodada final — pendências das Fases 4–6 `[x]`

Migration `0026_phase4_5_6_data_rights_and_unified_modes.sql`.

| # | O que foi feito | Onde |
|---|-----------------|------|
| 4.3 | CSP completa publicada em **modo só-relatório** (`Content-Security-Policy-Report-Only`): nada é bloqueado; violações aparecem nos logs da Vercel (busque `csp-violation`). Quando os logs ficarem limpos no uso real, troque o cabeçalho para `Content-Security-Policy`. | `next.config.ts`, `src/app/api/csp-report/route.ts` |
| 4.5 | Página **Conta e dados** (`/account`), para professores e alunos: baixar todos os dados (JSON) e excluir a conta com tudo o que ela possui (as imagens são apagadas antes). Link no cabeçalho do professor (“Account”) e na área do aluno (“My data”). | migration 0026, `AccountClient.tsx`, `account-repository.ts` |
| 4.5 | **Rascunho** da política de privacidade, baseado no que o app realmente coleta. **Não publicado:** precisa de revisão jurídica (dados de menores). | `docs/PRIVACY_POLICY_DRAFT.md` |
| 4.6 | Senha mínima de 8 caracteres também no servidor (Supabase Auth). | configuração do projeto |
| 5.7 | Regras unificadas: o app grava, ao salvar, quais modos Arcade a atividade libera (`derived_modes`), e o ranking de prática usa essa lista. Atividades salvas antes continuam com as regras antigas até serem salvas de novo. | migration 0026, `activity-repository.ts` |

**Ainda dependem de decisão sua:**
- Ativar o **pg_cron** para a limpeza de salas antigas (item 4.5).
- Publicar a política de privacidade após revisão jurídica; definir idade mínima e consentimento dos responsáveis.
- Promover a CSP de só-relatório para obrigatória, depois de alguns dias de logs limpos.
- Plano pago do Supabase (o gratuito pausa o projeto após ~1 semana sem uso).
- 3.3 (canais Realtime privados) segue opcional; com 3.1, um broadcast forjado só provoca releituras limitadas.

## Novas funcionalidades (depois das correções)

- Importação em lote (colar do Google Sheets / CSV).
- Geração com IA pelo servidor (chave fora do navegador, limite de uso, validação do resultado, revisão obrigatória).
- Relatório por questão (“as questões que a turma mais errou”) a partir da tabela `answers`.
- Reentrada no jogo em andamento por código + apelido, com aprovação do professor.
- Interface em pt-BR (i18n) e repetição espaçada nos flashcards.

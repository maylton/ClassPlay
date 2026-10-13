# Plano de correções — segurança, integridade e geração de jogos

Base analisada: commit `4bd1497` (v0.6.0). Este plano organiza as correções em fases curtas, cada uma
entregável sozinha, da mais barata e urgente para a mais estrutural.

Legenda: `[ ]` pendente · `[~]` em andamento · `[x]` concluído

---

## Fase 0 — Preparação do ambiente

Necessária antes de aplicar qualquer migration em produção.

- [x] Instalar Node.js (22+) e Git na máquina de desenvolvimento.
- [x] Trabalhar numa branch (`agent/remediation-phase-1`, etc.) — o CI já roda em `agent/**`.
- [ ] Instalar o Supabase CLI e subir um banco local (`supabase start`) para testar migrations antes de produção.
- [ ] Fazer backup do banco de produção antes de cada fase que traga migration.

---

## Fase 1 — Correções rápidas de alto impacto `[~]`

Mudanças pequenas, sem alterar a arquitetura. Migration: `0023_phase1_integrity_fixes.sql`.

**Status:** código implementado e testado na branch `agent/remediation-phase-1`; falta aplicar a migration.

- [x] `npm run test:remediation` (novo script `scripts/test-remediation-phase1.mjs`)
- [x] `typecheck`, `lint`, `build` e todas as suítes existentes passando
- [x] Comportamento do banco testado em Postgres real (`npm run test:db`). Contra as migrations antigas, o
      teste reproduz os bugs: o erro no Dynamite **adiantava** o relógio em vez de atrasar, e espaços
      repetidos não eram unificados.
- [ ] Aplicar `0023_phase1_integrity_fixes.sql` no Supabase (com backup)
- [ ] Conferir os critérios de aceite abaixo manualmente

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

## Fases 2 e 3 — Moderação, integridade e modo ao vivo confiável `[~]`

Branch `agent/remediation-phase-2-3` (empilhada sobre a Fase 1). Migration:
`0024_phase2_3_moderation_and_live_sync.sql`.

**Status:** código implementado e testado; falta aplicar a migration.

- [x] `typecheck`, `lint`, `build` e todas as suítes passando
- [x] `npm run test:remediation` (inclui `scripts/test-remediation-phase2-3.mjs`)
- [x] `npm run test:db`: regras novas testadas em Postgres real
- [ ] Aplicar `0023` (se ainda não aplicada) e depois `0024` no Supabase, com backup
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

## Fase 4 — Privacidade e plataforma `[ ]`

| # | Problema | Correção proposta |
|---|----------|-------------------|
| 4.1 | “Unlisted” é listável por qualquer pessoa pela API (`select … where visibility = 'unlisted'`). | Remover as políticas de leitura por `visibility`; servir atividades de prática por RPC `get_practice_activity(id)` que exige o ID exato e não expõe `owner_id`. Ajustar `community_catalog` e as políticas de `practice_scores`. |
| 4.2 | Imagens privadas não aparecem em prática, Comunidade, tarefas e cópias. | RPC/rota de servidor que gera URL assinada quando o visitante tem direito à atividade; ao clonar, copiar os arquivos para a pasta do novo dono. |
| 4.3 | Sem cabeçalhos de segurança. | CSP, `frame-ancestors 'none'`, `Referrer-Policy`, `X-Content-Type-Options` em `next.config.ts`. |
| 4.4 | Salvamento em várias etapas sem transação; apagar item apaga histórico de respostas. | RPC `save_activity(jsonb)` transacional; trocar o cascade de `answers.item_id` por `set null` (guardando o texto da pergunta na resposta). |
| 4.5 | LGPD com menores: dados nunca são apagados. | Rotina `pg_cron` apagando sessões/jogadores expirados após N dias; política de privacidade; exportar/excluir dados de aluno. |
| 4.6 | Senha de professor com 6 caracteres. | Mínimo 8, igual ao aluno (cliente + configuração do Supabase Auth). |

---

## Fase 5 — Geração de jogos e suporte multilíngue `[ ]`

| # | Problema | Correção proposta |
|---|----------|-------------------|
| 5.1 | Motor só entende inglês (morfologia, TTS `en-*`, rótulo “ENGLISH”). | Campo `target_language` na atividade (BCP-47, ex.: `es-ES`); TTS e rótulos usam esse idioma; o casador de frases cai para correspondência literal fora do inglês. |
| 5.2 | Typing Rush e Word Hunt descartam letras fora de a-z (russo, grego, japonês…). | Normalização Unicode (`\p{L}\p{N}`) em vez de `[a-z0-9]`; Word Hunt usa o alfabeto das próprias respostas para preencher a grade. |
| 5.3 | Acentos sempre ignorados (“esta” = “está”). | Opção por atividade: “exigir acentos”. |
| 5.4 | Só uma resposta correta. | Campo `accepted_answers` (lista) usado por Quiz, Gap Fill, Typing Rush e pelas RPCs ao vivo; Sentence Builder aceita ordens alternativas cadastradas. |
| 5.5 | Distratores ambíguos (sinônimos, formas gramaticais também corretas). | “Verificador de qualidade” no editor: distrator igual a uma resposta aceita, respostas duplicadas, resposta visível no prompt/dica, itens descartados com motivo. |
| 5.6 | Flashcards: “Got it” conta como acerto; “Review again” não devolve o cartão. | Reinserir o cartão no fim da fila; não usar autoavaliação em ranking/tarefa (ou marcar como “autoavaliado”). |
| 5.7 | Regras de elegibilidade duplicadas em TS e SQL (podem divergir). | Gravar os modos derivados disponíveis ao salvar a atividade e consultar essa coluna no SQL. |

---

## Fase 6 — Testes de verdade `[~]`

Os testes atuais conferem trechos de texto no código (regex). Eles passaram mesmo com o bug do item 1.4.

- [x] Base criada: `scripts/db/` sobe um Postgres embutido (PGlite, sem Docker), aplica todas as
      migrations do zero e testa RLS e RPCs com os papéis `anon`/`authenticated` (`npm run test:db`, no CI).
- [ ] Ampliar a cobertura de banco: RLS completa (professor A × B, aluno, anônimo) e as demais RPCs ao vivo.
- [ ] Testes de comportamento para os motores (já existe a infraestrutura com `ts.transpileModule`).
- [ ] Job de CI que sobe o Supabase local e aplica todas as migrations do zero.

---

## Novas funcionalidades (depois das correções)

- Importação em lote (colar do Google Sheets / CSV).
- Geração com IA pelo servidor (chave fora do navegador, limite de uso, validação do resultado, revisão obrigatória).
- Relatório por questão (“as questões que a turma mais errou”) a partir da tabela `answers`.
- Reentrada no jogo em andamento por código + apelido, com aprovação do professor.
- Interface em pt-BR (i18n) e repetição espaçada nos flashcards.

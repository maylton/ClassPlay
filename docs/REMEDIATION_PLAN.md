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
- [ ] Aplicar `0023_phase1_integrity_fixes.sql` no Supabase local, depois em produção (com backup)
- [ ] Conferir os critérios de aceite abaixo manualmente

| # | Problema | Correção | Arquivos |
|---|----------|----------|----------|
| 1.1 | **Redirecionamento aberto** no login: `?next=//site-malicioso.com` passava na checagem `startsWith("/")`. | Helper `safeNextPath()` que resolve o caminho contra uma origem fixa e só aceita caminhos da própria origem. | `src/lib/safe-redirect.ts`, `src/app/auth/page.tsx`, `src/app/auth/callback/route.ts` |
| 1.2 | **Biblioteca mostrava atividades de outros professores**: `listActivities()` não filtrava por dono e a RLS libera toda atividade `unlisted`. | Filtrar por `owner_id = user.id`. | `src/lib/repositories/activity-repository.ts` |
| 1.3 | **Aluno removido voltava à turma** só usando o código (o upsert fazia `active = true`). | A RPC recusa a entrada de quem foi desativado pelo professor. | migration 0023 |
| 1.4 | **Penalidade do Dynamite anulada**: o trigger `set_round_started_at` sobrescrevia `round_started_at` sempre que `current_question` mudava. | O trigger só reinicia o relógio quando a pergunta/turno muda **e** o campo não foi definido explicitamente no `UPDATE`. | migration 0023 |
| 1.5 | **Marcador de lacuna inconsistente** (2, 3 ou 5 underscores conforme o módulo): a lacuna digitada pelo professor era ignorada ou o item sumia do Gap Fill. | Qualquer sequência de 2+ `_` é aceita e normalizada para `_____` ao salvar e ao gerar o jogo. | `src/lib/activity-intelligence.ts` |
| 1.6 | **`classplay_normalize` não juntava espaços** (`'\\s+'` procurava o texto literal `\s`) e não tratava o apóstrofo curvo `’` do iOS. | Regex corrigida e apóstrofos normalizados. | migration 0023 |

**Critérios de aceite**
- `/auth/callback?next=//exemplo.com` redireciona para `/dashboard`.
- Professor A não vê atividades do professor B no dashboard, nas turmas nem no seletor da Comunidade.
- Aluno desativado recebe “You were removed from this class…” ao tentar entrar de novo.
- No Dynamite, após um erro, `round_started_at` no banco fica 3s no passado (não volta para `now()`).
- `She ___ to school.` (3 underscores) aparece como item jogável no Gap Fill.

**Atenção:** quem precisar readmitir um aluno removido deve, por enquanto, reativá-lo pelo painel do
Supabase (`class_members.active = true`). Um botão “Readmitir” entra na Fase 2.

---

## Fase 2 — Moderação e integridade dos dados `[ ]`

| # | Problema | Correção proposta |
|---|----------|-------------------|
| 2.1 | Ranking de prática aceita `INSERT` direto, com qualquer nota e qualquer nome; professor não consegue apagar. | Revogar `insert` direto; criar RPC `submit_practice_score` com limite por IP/sessão, teto plausível por modo (itens × pontuação máxima), filtro de nomes. Política de `DELETE` para o dono da atividade + botão “remover” no ranking. |
| 2.2 | Nota de tarefa é declarada pelo navegador; `due_at` não é verificado. | Na RPC: `p_total ≤ itens jogáveis`, teto de pontuação por modo, coluna `submitted_late`. Na tela do professor: marcar entregas atrasadas. |
| 2.3 | Readmitir aluno removido. | Botão “Readmitir” na lista de alunos (`ClassDetailClient`). |
| 2.4 | Salas criadas com atividade de outro dono; contas de aluno conseguem criar salas. | `with check` em `game_sessions`: atividade do próprio host e `not private.is_student_account()`. |
| 2.5 | Entrada em sala sem limites. | Limite de jogadores por sala (ex.: 60), filtro de apelidos (lista de palavras pt/en/es), “banir” além de “remover”. |
| 2.6 | Miniatura do dashboard nunca aparece (CSS recebe `storage:…`). | Resolver com `resolveActivityImageUrl` antes de usar no `background-image`. |

---

## Fase 3 — Modo ao vivo confiável `[ ]`

| # | Problema | Correção proposta |
|---|----------|-------------------|
| 3.1 | Canal Realtime público: qualquer aluno pode enviar `question`, `reveal`, `final`, `state` para todos. | O aluno passa a tratar todo broadcast como “algo mudou” e busca o estado oficial via `resume_classplay_player` (estender a RPC para devolver o placar final e o estado do Dynamite). Payloads de broadcast deixam de ser confiáveis. |
| 3.2 | Inundação de `answer-submitted` derruba o host (4 consultas por evento). | Debounce/throttle do `refresh` no host (ex.: no máximo 1 a cada 500 ms). |
| 3.3 | (Opcional) Canais privados. | Supabase Realtime Authorization com políticas em `realtime.messages`: só o host publica. |

**Critério de aceite:** um broadcast forjado pelo console de um aluno não altera a tela de nenhum outro aluno.

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

## Fase 6 — Testes de verdade `[ ]`

Os testes atuais conferem trechos de texto no código (regex). Eles passaram mesmo com o bug do item 1.4.

- [ ] Testes de banco com pgTAP no Supabase local: RLS (professor A × B, aluno, anônimo), RPCs ao vivo, Dynamite.
- [ ] Testes de comportamento para os motores (já existe a infraestrutura com `ts.transpileModule`).
- [ ] Job de CI que sobe o Supabase local e aplica todas as migrations do zero.

---

## Novas funcionalidades (depois das correções)

- Importação em lote (colar do Google Sheets / CSV).
- Geração com IA pelo servidor (chave fora do navegador, limite de uso, validação do resultado, revisão obrigatória).
- Relatório por questão (“as questões que a turma mais errou”) a partir da tabela `answers`.
- Reentrada no jogo em andamento por código + apelido, com aprovação do professor.
- Interface em pt-BR (i18n) e repetição espaçada nos flashcards.

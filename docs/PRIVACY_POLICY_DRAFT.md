# Política de Privacidade do ClassPlay — RASCUNHO

> **Rascunho técnico, não publicado.** Foi escrito a partir do que o código e o banco de dados realmente
> coletam (outubro/2026), para servir de base a uma revisão jurídica. Os trechos entre `[colchetes]`
> precisam ser preenchidos. Não publique sem revisão de um profissional, especialmente pelo tratamento
> de dados de crianças e adolescentes (LGPD, art. 14).

**Controlador:** [nome / razão social, CPF/CNPJ, endereço]
**Contato do encarregado (DPO):** [e-mail]
**Última atualização:** [data]

## 1. Quem usa o ClassPlay e quais dados tratamos

| Quem | Dados | Para quê |
|------|-------|----------|
| **Professor (conta)** | e-mail, senha (guardada pelo Supabase Auth, com hash), nome de exibição, escola (opcional) | Login, biblioteca de atividades, turmas |
| | Atividades criadas: textos, imagens enviadas, configurações | Funcionamento do app; publicação na Comunidade quando o professor escolhe |
| **Aluno com conta** | e-mail, senha (hash), nome de usuário | Login, entrar em turmas, entregar tarefas |
| | Participação em turmas e resultados das tarefas (pontuação, acertos, data, atraso) | O professor da turma acompanha o progresso |
| **Aluno em sala ao vivo (sem conta)** | apelido escolhido na hora, respostas e pontuação | Funcionamento do jogo e placar da sala |
| **Visitante do link de prática** | nome digitado para o ranking (opcional), pontuação | Ranking da atividade |

Não coletamos: CPF, telefone, endereço, data de nascimento, localização, câmera ou microfone.
A leitura em voz alta usa a voz do próprio dispositivo; o texto não é enviado a terceiros.

## 2. Onde os dados ficam

- **Supabase** (banco de dados, autenticação e armazenamento de imagens), região **São Paulo (sa-east-1)**.
- **Vercel** (hospedagem do site). Registros técnicos de acesso podem ser mantidos pela Vercel.
- [Listar outros operadores, se houver.]

## 3. Por quanto tempo

- **Salas ao vivo:** apelidos e respostas são apagados [90] dias depois que a sala termina
  [confirmar quando a limpeza automática estiver ativa — ver `REMEDIATION_PLAN.md`, item 4.5].
- **Contas, atividades, turmas e resultados:** enquanto a conta existir. Ao excluir a conta, tudo o que
  ela possui é apagado (ver item 5).
- **Rankings de prática:** enquanto a atividade existir; o professor pode remover entradas a qualquer momento.

## 4. Compartilhamento

- Atividades publicadas na **Comunidade** ficam visíveis a qualquer pessoa, com o nome de exibição do autor.
- **Links de prática** só podem ser abertos por quem tem o link.
- Resultados de tarefas são visíveis ao professor da turma.
- Não vendemos dados nem os usamos para publicidade. [Confirmar.]

## 5. Direitos do titular

Pela página **Conta e dados** (`/account`), qualquer usuário com conta pode, sem precisar nos contatar:
- **baixar** uma cópia dos seus dados (arquivo JSON);
- **excluir** a conta e tudo o que ela possui.

Para outros pedidos (correção, informação sobre compartilhamento, revogação de consentimento), escreva
para [e-mail]. Responderemos em até [15] dias.

## 6. Crianças e adolescentes

[Definir com a assessoria jurídica: idade mínima para conta de aluno, necessidade de consentimento
específico de pais/responsáveis (LGPD art. 14, §1º) e o papel da escola/professor como intermediário.
Hoje o app não pede idade nem consentimento dos responsáveis.]

## 7. Segurança

Acesso aos dados controlado por regras no banco (Row Level Security); senhas nunca são armazenadas
em texto; conexões cifradas (HTTPS); imagens em armazenamento privado.

## 8. Alterações

[Como os usuários serão avisados de mudanças nesta política.]

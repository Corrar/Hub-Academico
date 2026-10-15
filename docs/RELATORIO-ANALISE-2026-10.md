# Análise e conclusão funcional — 15/10/2026

Branch: `claude/ecstatic-tesla-clkdqb`, a partir da `main` em `aaaa2ca`.

## Resumo

A análise percorreu o código, a documentação, os protótipos de design e o
sistema em execução no navegador. O painel já cobria a estrutura acadêmica,
publicações, entregas, eventos e grade, mas faltavam fluxos que o produto
assume como centrais — **chamada e frequência**, manutenção de contas locais,
acompanhamento de entregas pelo professor, agendamento de avisos e lembretes com
não lidos — além de dois defeitos e várias lacunas operacionais.

Tudo o que dependia apenas de código foi implementado, testado em SQLite e em
PostgreSQL 16 e exercitado de ponta a ponta no Chromium com os três perfis.
O que continua pendente depende de credenciais, decisões ou serviços da
instituição (seção [Dependências externas](#o-que-depende-de-terceiros)).

## Como a análise foi feita

1. Leitura de `PRODUCT.md`, dos relatórios anteriores e de todo o backend e painel.
2. Execução das suítes existentes: 69 testes de API (2 ignorados) e 13 de interface.
3. Execução do sistema com dados sintéticos e revisão visual em Chromium, a 420 px
   (aluno e professor) e 1280 px (coordenação). Foi a primeira verificação em
   navegador real; as revisões anteriores registravam esse item como pendente.
4. Comparação com os protótipos: 14 telas do aluno (`fatec-adamantina-app/` e
   `design/aluno/`), 7 do professor e 8 da coordenação (`design/`).

## Diagnóstico — o que faltava

| Área | Situação encontrada | Consequência |
| --- | --- | --- |
| Chamada e frequência | Inexistentes, embora confirmadas no `PRODUCT.md` e desenhadas (`Chamada`, `Frequência`) | O aluno não sabia “quanto ainda pode faltar”, uma das três perguntas de sucesso do produto |
| Contas locais | Sem troca de senha, sem redefinição, sem edição de nome/perfil | Senha inicial definitiva; erro de cadastro só se corrigia arquivando |
| Sessão | Expirava 30 min após o login, mesmo em uso | Usuário ativo perdia o trabalho no meio de um formulário |
| Anexos | Apenas `.txt` de 512 KiB | Incompatível com o uso real (PDF, slides, planilhas) previsto no design |
| Avisos | Sem “Publicar em”, “Sai do ar em” nem alcance antes de publicar | Contrariava o princípio 4 (alcance amplo exige fricção) |
| Professor | Sem contagem de entregas, sem lista de quem não entregou, sem fila de avaliação | Avaliar exigia abrir entrega por entrega |
| Aluno | Cartões sem situação da entrega; “desfazer” só implícito | Não respondia “o que vence e o que já entreguei” de relance |
| Eventos | Organizador não via os inscritos | Inscrição sem uso prático para quem organiza |
| Lembretes | Sem não lidos e sem notas recebidas | Central de avisos sem noção de novidade |
| Coordenação | “Precisa de você” sem alertas de estrutura | Turma sem professor ou sem grade passava despercebida |
| Listagens | Sem busca nem filtro por perfil | Inviável com centenas de alunos |
| Administração | Só revogava todas as sessões de uma pessoa | Sem resposta proporcional a um dispositivo perdido |
| Operação | Sem limite global de corpo; sem base de demonstração; README desatualizado | Risco de abuso; homologação começava vazia |

Defeitos encontrados durante a verificação:

- **Fuso horário:** um prazo enviado como `23:59-03:00` era gravado no SQLite sem
  conversão e lido como 20:59. As datas de publicação agora são normalizadas em UTC
  na validação, para qualquer cliente da API.
- **Mensagens de confirmação:** os diálogos re-renderizavam a página depois de salvar
  e apagavam a confirmação. O diálogo agora exibe a mensagem após a atualização.

## O que foi implementado

### Dados — migração `0004`

Aditiva e sem perda: tabelas `attendance_lessons` e `attendance_records`
(chamada), `notification_states` (leitura de lembretes) e colunas `publish_at`,
`expires_at`, `graded_at`, `media_type`, `size`. O tamanho dos anexos existentes
é preenchido a partir do conteúdo. Downgrade continua bloqueado, como nas
revisões anteriores. A revisão esperada fica em `SCHEMA_REVISION` (`app/db.py`).

### Funcionalidades

| Fluxo | API | Painel |
| --- | --- | --- |
| Chamada | `GET/PUT /learning/attendance/sheet`, `GET /learning/attendance/lessons`, `PATCH .../lessons/{id}/archive` | “Fazer chamada” nas aulas do dia; todos presentes por padrão, toque marca falta; data anterior; correção com versão |
| Frequência | `GET /learning/attendance/summary` | Página do aluno por disciplina, saldo de faltas, alerta no início e aulas perdidas |
| Alunos da turma | `GET /learning/groups/{id}/students` | Entregas, média do hub, faltas e presença; frequência individual |
| Senha e contas | `POST /me/password`, `POST /users/{id}/password`, `PUT /users/{id}` | “Alterar senha” no perfil; editar e redefinir na lista de usuários |
| Listagens | `q` e `role` em `/users`; `q` em cursos, disciplinas e turmas | Busca e filtro na tabela |
| Sessão | Renovação por atividade em `security.renew` | Transparente para o usuário |
| Agenda de publicações | `publish_at`, `expires_at` e `state` calculado | Campos opcionais no editor; selos “Agendado” e “Fora do ar” |
| Alcance | `GET /learning/reach` | “Alcance: N pessoas” no editor e na confirmação institucional |
| Entregas | `my_submission` e contagens na listagem; `GET /activities/{id}/summary`; `pending=true` | Selo da situação; resumo; quem não entregou; “Salvar e ir para o próximo”; “Desfazer entrega” |
| Inscritos | `GET /learning/events/{id}/enrollments` | Lista no detalhe do evento para quem organiza |
| Anexos | Allowlist com conferência de assinatura em `academic/files.py` | Formatos e limites exibidos; nome com acentos |
| Lembretes | `GET /learning/notifications`, `POST /learning/notifications/read` | Contador no sino e na navegação; notas recebidas; marcar como lidas |
| Alertas | `alerts` em `GET /dashboard` | Turma sem professor, sem grade, vínculos a vencer |
| Admin | `POST /admin/sessions/{id}/revoke` | Botão “Revogar” por sessão |
| Proteção | `limits.BodyLimit` | Requisições acima do limite recebem 413 |
| Demonstração | `python -m app.cli seed-demo` | Base fictícia coerente para homologação |

### Decisões e premissas (ajustáveis)

- **Limite de faltas:** 25% das aulas previstas, configurável por
  `ATTENDANCE_ABSENCE_LIMIT_PERCENT`. Aulas previstas = ocorrências da grade dentro
  da vigência do vínculo do aluno. O percentual é rotulado como registro do hub
  e **não substitui o diário oficial**.
- **Quem lança a chamada:** professor da turma e coordenação. Data limitada ao
  dia da aula ou anterior e ao dia da semana da grade. Sem prazo de correção:
  cada correção é versionada e auditada com a lista de faltas antes e depois.
  A regra institucional de retificação ainda precisa ser confirmada.
- **Anexos:** PDF, PNG, JPG, DOCX, XLSX, PPTX, CSV, IPYNB e TXT. Até 4 MiB por
  arquivo (`ATTACHMENT_MAX_MB`, de 1 a 25), abaixo do limite de corpo das funções
  da Vercel usadas pelo proxy; textos até 512 KiB. Extensão, tipo declarado e
  assinatura precisam coincidir; documentos com macro são recusados; o download é
  sempre anexo com `nosniff` e CSP `sandbox`. **Não há antivírus**.
- **Sessão:** 30 min de inatividade, renovada no máximo a cada 5 min, com limite
  absoluto de 8 h desde a autenticação. O cookie dura até o limite absoluto; a
  validade real é sempre conferida no servidor.
- **“Sai do ar em”** vale apenas para avisos, como no protótipo.
- **Lembretes** são consultados no aplicativo. Notificação push continua pendente.
- **`seed-demo`** só roda em base sem cursos, depois do `bootstrap`, e recusa
  execução com Microsoft ativo. Endereços usam o sufixo `.demo`.

## Verificação

| Verificação | Resultado |
| --- | --- |
| API em SQLite | 89 aprovados, 2 ignorados (exclusivos de PostgreSQL) |
| API em PostgreSQL 16 local | 90 aprovados, 1 ignorado (exclusivo de SQLite) |
| Interface (jsdom) | 17 aprovados, incluindo chamada, frequência, lembretes e senha |
| Ruff, `ruff format`, Prettier, `node --check`, sincronização do `frontend/`, `alembic check` | Aprovados |
| Ponta a ponta no Chromium | Aprovado (roteiro abaixo), sem erros de JavaScript |

Roteiro no navegador: aluno anexa PDF ao rascunho, envia, desfaz e reenvia;
cancela e refaz a inscrição em evento; marca lembretes como lidos; troca a senha e
entra com a nova. Professora usa a fila “Salvar e ir para o próximo” e consulta os
alunos da turma. Coordenação cria aviso institucional agendado vendo o alcance,
consulta inscritos, busca, edita e redefine a senha de uma aluna e confere a
auditoria; a aluna entra com a senha redefinida.

Não foram feitos: teste com leitor de tela, teste de carga, login Microsoft real,
pentest. Testes em DOM simulado e roteiros automatizados não substituem esses.

## Segunda etapa — 16/10/2026

A segunda etapa transformou em código o que ainda era listado como pendência
externa, deixando para a instituição apenas credenciais e decisões.

| Entrega | Como funciona |
| --- | --- |
| Aplicativo instalável (PWA) | Manifesto, ícones do logotipo oficial e service worker; instala no Android, iOS e computador e abre sem conexão. Respostas da API nunca são guardadas em cache |
| Notificações push | Web Push (RFC 8291/8292) implementado sobre `cryptography` e `PyJWT`, sem conta em Google/Apple/Mozilla; chaves por `vapid-keys`. Fila deduplicada, preferências por categoria, retentativas com recuo, remoção de dispositivos inválidos e lembrete de prazo 24 h antes. Endpoints restritos aos serviços de push dos navegadores (sem SSRF). Canal Expo pronto para o app nativo |
| Disparo | Laço interno (`PUSH_DISPATCH_INTERVAL_SECONDS`), comando `dispatch-notifications` ou endpoint com token, com workflow opcional do GitHub para hospedagens que dormem |
| Antivírus | Cliente ClamAV (`clamd` INSTREAM); arquivo infectado é recusado e auditado; scanner indisponível recusa o envio |
| LGPD | Cópia dos dados do titular em JSON, aviso de privacidade no login e no perfil, contato configurável e limpeza automática de dados operacionais vencidos |
| Backups | `pg-backup` e `pg-restore-check` com `pg_dump`/`pg_restore`, ensaio em banco vazio e verificação da revisão, contagens e proteção da auditoria |
| Diário oficial | CSV de frequência (P/F por aula) e de notas por turma, com proteção contra fórmulas e auditoria |
| Acessibilidade | Auditoria axe-core (WCAG 2.1 A/AA) em 27 telas e diálogos dos três perfis e no login; dois contrastes corrigidos; zero violações |

Verificação da segunda etapa: 115 testes de API em SQLite (3 ignorados) e 117 em
PostgreSQL 16 (1 ignorado), incluindo criptografia conferida por um decifrador
independente, fila, preferências, SSRF, Expo, antivírus com `clamd` simulado,
exportações e backup/restauração reais; 18 testes de interface. No Chromium:
service worker, manifesto, ícones, notificação entregue pelo protocolo DevTools,
abertura offline, download dos dados e o roteiro ponta a ponta anterior. A
inscrição real em um serviço de push não pôde ser exercida no navegador sem
interface gráfica deste ambiente; a cifra e o envio estão cobertos pelos testes.

## O que depende de terceiros

| Pendência | O que é necessário |
| --- | --- |
| Login Microsoft e primeiro administrador | Tenant, registro do app, callback, política MFA e Object ID verificado (`MICROSOFT-ADMIN.md`) |
| Homologação publicada | Deploy desta branch no Render e na Vercel, `alembic upgrade head` (revisão `0005`), chaves VAPID e ensaio de restauração do PostgreSQL hospedado |
| Antivírus em operação | Servidor ClamAV com cerca de 2 GB de memória (fora do plano gratuito do Render) |
| App nas lojas (opcional) | Conta Expo e contas de desenvolvedor Google/Apple; o PWA já cobre Android e iOS |
| Regra oficial de frequência | Confirmação com a coordenação: limite, fonte oficial (diário do CPS) e responsável por retificações |
| Governança de dados (LGPD) | Revisão do aviso de privacidade, canal do encarregado e tabela de temporalidade |
| Pentest | Confirmação do ambiente publicado e escopo autorizado |
| Dados reais | Cursos, turmas, horários e vínculos aprovados pela instituição |

## Como testar localmente

Na pasta `backend`, com a venv ativa (ver `backend/README.md`):

```bash
alembic upgrade head
python -m app.cli bootstrap --email coordenacao.dev@fatec.sp.gov.br --name "Coordenação de teste"
python -m app.cli seed-demo
uvicorn app.main:create_app --factory --reload --host 127.0.0.1
```

Abra `http://127.0.0.1:8000/panel/`. O `seed-demo` pede uma senha comum às contas
fictícias e lista os e-mails criados (professores Marcelo Dias e Renata Alves;
alunos como Lucas Silveira e Ana Ribeiro). A coordenação usa a senha do bootstrap.

## Próximos passos recomendados

1. Publicar esta branch na homologação, aplicar a migração `0004` e repetir o
   roteiro de navegador com as contas do `seed-demo`.
2. Validar com a coordenação a regra de frequência e o risco de chamada em dois
   lugares (diário oficial), antes de usar a chamada com dados reais.
3. Gerar e cadastrar as chaves VAPID e o contato de privacidade; providenciar o
   ClamAV antes de receber arquivos reais (`OPERACAO.md`).
4. Concluir a configuração Microsoft e executar o pentest acordado.

# Backend e painel da coordenação

API de desenvolvimento em Python 3.12. Execute todos os comandos desta página
na pasta `backend`. Não há serviço externo nem cobrança necessários para testar.

## Instalar no Windows (PowerShell)

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.lock
Copy-Item .env.example .env
.\.venv\Scripts\alembic upgrade head
.\.venv\Scripts\python -m app.cli bootstrap --email coordenacao.dev@fatec.sp.gov.br --name "Coordenação de teste"
.\.venv\Scripts\uvicorn app.main:create_app --factory --reload --host 127.0.0.1
```

O endereço acima é fictício e serve como identificação do teste; nenhum e-mail é
enviado. A senha local é solicitada no terminal, sem eco e sem valor padrão.

## Instalar no Linux/macOS

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.lock
cp .env.example .env
alembic upgrade head
python -m app.cli bootstrap --email coordenacao.dev@fatec.sp.gov.br --name "Coordenação de teste"
uvicorn app.main:create_app --factory --reload --host 127.0.0.1
```

O painel está em `/panel/` no mesmo servidor. Entre com o e-mail e a senha
provisionados pelo bootstrap. Copie o `.env.example` atualizado: para o HTTP
local, `WEB_SECURE_COOKIE=false` permite enviar o cookie. Fora desse caso,
o padrão é `Secure=true`. `WEB_ORIGINS` deve conter a origem exata do painel.

Para explorar a API, `/docs` continua disponível. Em `POST /api/v1/auth/login`, use o e-mail e a
senha criados no terminal. Copie **somente o valor de `access_token`** e cole em
**Authorize**. Saia do painel antes de usar o explorador Bearer: quando há cookie,
ele tem precedência e exige CSRF nas alterações. A sessão dura 30 minutos;
o logout a revoga no servidor.

Os arquivos `.env` e `hub.db` ficam fora do Git. Variáveis de ambiente existentes
têm prioridade sobre `.env`. O `bootstrap` recusa execução se já existir coordenação.
Outros usuários são criados pela coordenação em `/api/v1/users`, sem auto-cadastro.
Senha mínima: 12 caracteres. Não use sua senha real da conta institucional neste piloto.

## Painel conectado

O painel usa HTML, CSS e JavaScript locais, sem CDN ou armazenamento de tokens
em `localStorage`/`sessionStorage`. Os dados pessoais são inseridos como texto,
sem interpretação de HTML. Os logotipos originais foram preservados.

- Visão geral: contagens reais de registros não arquivados, não de vínculos vigentes.
- Cursos, disciplinas e turmas: cadastro, edição, arquivamento e restauração.
- Usuários: criação e arquivamento/restauração de alunos e professores. Contas
  de coordenação não podem ser arquivadas por esse fluxo. A criação local de
  coordenação já existente na API permanece restrita à coordenação; não cria admin.
- Matrículas: seleção de pessoa/turma por nome, datas e atualização de vigência.
- Listagens: páginas de 25 registros. Seletores têm busca e carregamento de mais
  opções; cadastros além da primeira página continuam acessíveis.
- Auditoria: autor, instante em São Paulo, operação e valores antes/depois.

`POST /api/v1/web/login` exige Origin explicitamente permitido e aceita somente
coordenação. Retorna perfil e token CSRF; a credencial de sessão fica no cookie
HttpOnly com SameSite=Strict e 30 minutos de validade. Login bem-sucedido gira a
sessão do navegador. `GET /api/v1/web/session` recupera perfil e proteção CSRF.
Mutações autenticadas por cookie exigem Origin permitido e `X-CSRF-Token`, mesmo
se também houver Authorization. `POST /api/v1/auth/logout` revoga a sessão atual
e remove o cookie. A API Bearer continua disponível para clientes não web.

O painel aplica CSP sem scripts/estilos inline e sem recursos externos,
`frame-ancestors 'none'`, `X-Frame-Options: DENY`, `no-store`, `nosniff` e política
de referência restrita. Erros de validação não devolvem o corpo enviado.
Essas medidas não substituem identidade institucional/MFA nem revisão externa.

Novas consultas administrativas: `GET /api/v1/dashboard` e
`GET /api/v1/lookup/{resource}`. A busca aceita `q`, `offset`, `limit` e uma lista
limitada de `ids` para resolver rótulos de referências, inclusive arquivadas.

## Primeiro fluxo executável

1. Criar curso em `POST /api/v1/courses`: `{"code":"CD","name":"Ciência de Dados"}`.
2. Criar disciplina em `POST /api/v1/subjects`: `course_id` retornado, `code`, `name` e `term` (ex.: 3).
3. Criar oferta de turma em `POST /api/v1/groups`: `subject_id`, `semester` (ex.: `2026/2`) e `name`.
4. Criar aluno/professor em `POST /api/v1/users`: `name`, `email`, `password` e `role` (`student` ou `teacher`).
5. Vincular em `PUT /api/v1/memberships`: `user_id`, `group_id`, `starts_on` e `ends_on` em `YYYY-MM-DD`.
6. Entrar como o novo usuário e consultar `GET /api/v1/me/groups`.

`group` representa **uma oferta de disciplina em um período letivo**, não toda
a classe/coorte de um curso. O termo é o número curricular na disciplina. Uma
coorte com matrícula em lote e uma entidade própria de período letivo são próximas etapas.

## Rotas e regras

| Rota | Acesso e comportamento |
| --- | --- |
| `GET /api/v1/me` | Próprio perfil, sem hash de senha |
| `GET /api/v1/me/groups` | Ofertas com vínculo vigente; coordenação vê todas ativas |
| `GET /api/v1/groups/{id}` | Verifica vínculo por objeto; turma fora do alcance retorna 404 |
| `POST/GET /api/v1/users` | Coordenação provisiona e lista contas |
| `POST/GET /api/v1/courses`, `/subjects`, `/groups` | Coordenação cadastra e lista |
| `PUT /api/v1/courses/{id}`, `/subjects/{id}`, `/groups/{id}` | Edição completa; sem transferência de pai |
| `PUT/GET /api/v1/memberships` | Coordenação atribui/lista vínculos; PUT atualiza ou restaura vínculo existente |
| `PATCH /api/v1/{resource}/{id}/archive` | `{"archived":true}` arquiva; `false` restaura |
| `GET /api/v1/audit` | Histórico acessível somente à coordenação |
| `GET /health/live`, `/health/ready` | Processo ativo e revisão do banco pronta |

Listagens usam `offset` e `limit` (1–100). Listagens administrativas aceitam
`archived=true`. Vigência considera a data de São Paulo, com início/fim inclusivos.
Arquivar curso ou disciplina oculta suas turmas dos alunos/professores sem apagar
descendentes; restaurar o pai pode torná-las visíveis novamente. Arquivar usuário
revoga todas as suas sessões, que não voltam a valer após restauração.

Não há endpoint para excluir definitivamente. As alterações de domínio e a
auditoria são gravadas na mesma transação. Triggers recusam UPDATE/DELETE na
auditoria; o administrador do banco ainda pode alterar o esquema. Para operação
real, separar privilégios de migração e execução e definir retenção.

## Backup e recuperação do SQLite local

Com a venv ativa (no Windows, use `.\.venv\Scripts\python`):

```bash
python -m app.cli backup backup-2026-09-08.db
python -m app.cli restore-check backup-2026-09-08.db restaurado-2026-09-08.db
```

O destino precisa ser novo. A cópia é criada pela API de backup do SQLite, com
verificação de integridade. `restore-check` copia o backup para outro arquivo e
verifica a revisão do esquema e as chaves estrangeiras. Para usar a cópia,
pare a API, aponte `DATABASE_URL` para ela e reinicie. O comando não troca o banco
ativo. Backups incluem dados pessoais e hashes; preserve-os em local controlado.

## PostgreSQL e testes

Para PostgreSQL local, configure `DATABASE_URL=postgresql+psycopg://...` no `.env`
e rode `alembic upgrade head`. A migração cria as tabelas e os triggers de auditoria.
Isso **não copia** os dados do SQLite. Migração de dados e backup/restauração
PostgreSQL com `pg_dump`/`pg_restore` ainda precisam de roteiro operacional próprio.

```bash
python -m pytest -q
ruff check .
ruff format --check .
alembic check
```

Testes locais usam bancos SQLite temporários e verificam isolamento entre papéis
e turmas, vencimento de vínculos/sessões, revogação, validação, auditoria,
persistência e recuperação. O workflow roda também em PostgreSQL descartável.
**`TEST_DATABASE_URL` é exclusivo dos testes: eles apagam e recriam o schema
`public` desse banco. Nunca aponte para um banco com dados a preservar.**

## Limites desta entrega

- Contas locais servem só ao desenvolvimento. `APP_ENV=production` recusa iniciar.
  A integração Microsoft/Entra e a política de aprovação institucional não estão implementadas.
- O painel web está conectado; o app Expo ainda não foi implementado.
- Não houve validação visual em navegador nesta entrega. A responsividade e os
  fluxos de teclado precisam de revisão antes do piloto.
- Ainda faltam grade horária, importação em lote, atividades, uploads, notas, avisos,
  eventos, push e chamada. A chamada depende da definição do registro usado pela faculdade.
- No PostgreSQL, tentativas de login usam locks transacionais para serializar
  os limites entre instâncias. SQLite continua exclusivo do desenvolvimento local.
- Hospedagem de teste exige `APP_ENV=staging` e todas as proteções descritas em
  [HOMOLOGACAO-VERCEL.md](../docs/HOMOLOGACAO-VERCEL.md). Produção segue bloqueada.
- Não há recuperação de senha, renovação de sessão, edição de perfil/papéis,
  revogação administrativa por dispositivo ou rotina automática de backup.

## Referências técnicas

- https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/ (hashes Argon2 com pwdlib;
  esta API usa sessões opacas no servidor, não JWT).
- https://alembic.sqlalchemy.org/en/latest/tutorial.html (migrações versionadas).

- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
  (atributos do cookie, expiração e rotação da sessão).
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
  (verificação de origem e token CSRF no cabeçalho; SameSite como defesa adicional).

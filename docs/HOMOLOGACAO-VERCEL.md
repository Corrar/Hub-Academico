# Homologação protegida na Vercel

Esta configuração prepara um ambiente exclusivamente de testes com dados fictícios.
Não habilita produção, SSO institucional ou o futuro papel platform_admin.

## Corrigir o erro do log enviado

O deploy do log usou `main` no commit `e393d9f` e tentou executar `vite build`.
Esse commit não contém o backend/painel. O projeto executável é Python/FastAPI.
Não é necessário instalar Vite para corrigir esse deploy.

Use a branch **feat/cloud-staging** (inclui a fundação e o painel dos PRs anteriores)
para criar uma Preview Deployment. A integração em `main` continua sujeita à revisão.

Em Settings → Build and Deployment do projeto Vercel:

| Configuração | Valor |
| --- | --- |
| Root Directory | `backend` |
| Framework Preset | FastAPI |
| Build Command | Remover o override `vite build`; o arquivo `backend/vercel.json` usa `python -m compileall -q app index.py` |
| Output Directory | Remover o override; não usar `dist` |
| Install Command | Padrão automático de Python; remover comandos npm antigos |
| Python | 3.12, definido em `.python-version` |
| Entrada | `index.py`, instância `app` |

Não publique só o HTML: painel e API precisam da mesma origem para a sessão e o CSRF.
Não use um preset Vite/React ou um diretório do protótipo como raiz.

## Banco e segredos

Crie um PostgreSQL exclusivo de homologação no provedor escolhido. Não reutilize
credenciais ou banco com dados institucionais. Verifique preço, limites e política
de expiração antes de contratar. Nenhum recurso foi contratado por esta entrega.

Configure em Vercel → Settings → Environment Variables, escopo **Preview**:

| Variável | Valor |
| --- | --- |
| `APP_ENV` | `staging` |
| `STAGING_SYNTHETIC_DATA_ONLY` | `true` |
| `DATABASE_URL` | URL PostgreSQL externa, com prefixo `postgresql+psycopg://` e TLS |
| `WEB_SECURE_COOKIE` | `true` |
| `WEB_ORIGINS` | Origem HTTPS exata da prévia, sem barra final; separar por vírgulas se houver mais de uma |
| `STAGING_ACCESS_PASSWORD` | Segredo aleatório exclusivo, entre 32 e 128 caracteres |

Use preferencialmente a URL estável da branch, fornecida pela Vercel, para
`WEB_ORIGINS`; não adivinhe o domínio e não use curingas. Quando mudar a origem,
atualize a variável e faça novo deploy. O Host também é validado contra essa lista.
Sem essas configurações, o serviço recusa iniciar. Não configure `APP_ENV=development`
para contornar a verificação: a entrada Vercel recusa esse modo.

A URL do banco precisa de `sslmode=require`, `verify-ca` ou `verify-full`.
Prefira `verify-full` com os certificados/configuração indicados pelo provedor
(por exemplo, `sslrootcert=system` quando suportado). Preserve os demais parâmetros
da URL e escape caracteres especiais da senha conforme instruções do provedor.
Não registre URLs reais ou segredos no Git, nas capturas ou na descrição de PR.

Gere o segredo em um gerenciador de senhas. A autenticação adicional do ambiente
usa o usuário **tester** e esse segredo. Ela é independente do login da coordenação.
Ative também Vercel Authentication/Deployment Protection no projeto quando disponível
para essa prévia. Não crie exceções públicas para facilitar testes.

## Preparar o banco uma única vez

Em um terminal confiável, no checkout da branch e dentro de `backend`, instale
Python 3.12 e as dependências conforme `backend/README.md`. Copie
`.env.staging.example` para `.env` e preencha a URL do banco de testes e as demais
variáveis. O arquivo `.env` está ignorado pelo Git.

Com a venv ativa:

```sh
alembic upgrade head
alembic check
python -m app.cli bootstrap --email coordenacao.teste@fatec.sp.gov.br --name "Coordenação de homologação"
```

O e-mail acima é uma identificação fictícia; não há envio nem autenticação Microsoft.
A senha da conta é escolhida no terminal, sem eco. Use senha exclusiva de teste.
O bootstrap recusa criar outro coordenador quando já existe um. Execute esse
provisionamento por um único operador; não faça em paralelo.

Migrações e bootstrap **não** executam durante builds ou inicialização das funções.
Isso evita que builds simultâneos alterem o banco ou criem contas repetidas.
Use uma URL direta do banco para migrações; no runtime pode usar o pooler compatível
com transações do provedor. O aplicativo não mantém pool próprio em homologação.
Nunca configure `TEST_DATABASE_URL` com esse banco: a suíte apaga o schema de testes.

## Subir e conferir

1. Faça uma Preview Deployment da branch com as configurações anteriores.
2. Acesse a origem configurada e autentique-se na proteção Vercel, se habilitada.
3. Na proteção adicional do Hub, use `tester` e o segredo de homologação.
4. Entre no painel com a conta de coordenação provisionada pelo terminal.
5. Confirme `/health/ready` autenticado: deve retornar `status: ok`.
6. Teste curso → disciplina → turma → aluno/professor → matrícula, edição,
   arquivamento/restauração, auditoria, recarga, logout e layout móvel.

`/health/live` informa apenas a disponibilidade do processo. O restante, incluindo
arquivos do painel e prontidão do banco, exige a proteção adicional. Acesso à
proteção não concede permissões de coordenação: o login do app continua obrigatório.
Tokens ficam em cookie Secure/HttpOnly/SameSite=Strict, com CSRF nas alterações.
O Swagger/OpenAPI está desativado em staging. Como o cabeçalho Authorization é
usado pela proteção adicional, os testes hospedados usam o fluxo web por cookie;
o explorador Bearer continua destinado ao desenvolvimento local.

A proteção HTTP Basic pode ficar memorizada no navegador até fechar a sessão;
"Sair da conta" revoga a sessão do Hub, não a proteção externa. Rotacione o segredo
para retirar o acesso de um testador. Nenhuma senha de homologação deve virar senha
de produção. A limitação de login por conta/peer é serializada no PostgreSQL entre
instâncias; endereços de proxy podem compartilhar o limite conservador de peer.

## Encerramento e limites

A configuração e os testes automatizados não comprovam um deploy real: ainda é
necessário preencher as variáveis, preparar o banco e executar a validação no
navegador na URL resultante. Nenhuma conta cloud, banco ou publicação foi criada.
Ao encerrar os testes, revogue contas/segredos e remova o ambiente e o banco de
homologação após preservar apenas evidências sem dados pessoais necessárias.
Produção continua bloqueada até identidade institucional, MFA administrativo,
revisão independente e requisitos operacionais definidos no roteiro.

## Referências

- https://vercel.com/docs/frameworks/backend/fastapi
- https://vercel.com/docs/functions/runtimes/python
- https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication

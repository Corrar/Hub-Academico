# Homologação protegida na Vercel

Esta configuração prepara um ambiente exclusivamente de testes com dados fictícios.
Não habilita produção. O login Microsoft e o console admin são configurados
separadamente conforme `MICROSOFT-ADMIN.md`.

## Corrigir o erro do log enviado

O deploy do log usou `main` no commit `e393d9f` e tentou executar `vite build`.
Esse commit não contém o backend/painel. O projeto executável é Python/FastAPI.
Não é necessário instalar Vite para corrigir esse deploy.

Use a branch **feat/cloud-staging** (inclui a fundação e o painel dos PRs anteriores)
para criar uma Preview Deployment. A integração em `main` continua sujeita à revisão.

Em Settings → Build and Deployment do projeto Vercel:

| Configuração | Valor |
| --- | --- |
| Root Directory | Raiz do repositório (vazio/`./`); `backend` também é suportado |
| Framework Preset | FastAPI |
| Build Command | Remover o override `vite build`; o `vercel.json` da raiz selecionada define o comando Python correto |
| Output Directory | Remover o override; não usar `dist` |
| Install Command | Padrão automático de Python; remover comandos npm antigos |
| Python | 3.12, definido em `.python-version` |
| Entrada | `index.py`, instância `app`, disponível nas duas raízes |

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

## Correção adicional: deploy pela raiz do repositório

Agora a raiz também contém `index.py`, `requirements.txt`, `.python-version` e
`vercel.json`. O código funciona importado como `backend.index` pela raiz e como
`index` quando a pasta `backend` é selecionada. As duas configurações anulam o
Output Directory do projeto e definem build Python. O mesmo conjunto de
dependências e os mesmos controles de homologação são usados nas duas entradas.

A `main` ainda contém apenas o protótipo inicial enquanto os PRs não forem
integrados. Fazer Redeploy de um deploy antigo reutiliza o commit antigo. Crie
um **novo deploy da branch `feat/cloud-staging`**, com as variáveis de Preview
preenchidas, ou integre os PRs após revisão antes de fazer deploy da `main`.
A configuração no Git não altera automaticamente a branch do projeto na Vercel.

Para usar a entrega Microsoft/admin, faça deploy da branch `feat/admin-microsoft`
e siga primeiro `MICROSOFT-ADMIN.md` (migração 0002 e provisionamento inicial).
A branch anterior de staging não recebe automaticamente as funcionalidades novas.


## Erro de parsing do requirements.txt na raiz

Se o build mostrar `Error parsing included file` para `-r backend/requirements.txt`,
use a revisão que contém a lista completa de dependências no `requirements.txt`
da raiz. O arquivo da raiz e o do backend devem listar as mesmas versões;
um teste automatizado verifica essa correspondência e impede novas inclusões `-r`.
Esta correção não exige trocar o framework nem remover as proteções de staging.

## Render: serviço Python

O projeto também contém `render.yaml` na raiz. Ele usa `runtime: python`,
`rootDir: backend`, `pip install -r requirements.txt`, `alembic upgrade head` e
`uvicorn app.main:create_app --factory --host 0.0.0.0 --port $PORT`.

O serviço que aparece nos logs com `npm start` foi criado como Node. Ele não deve
ser reutilizado para este backend: crie um novo Web Service Python a partir da
branch `melhoria/revisao-e-fluxos-academicos` ou aplique o Blueprint. Runtime é
uma propriedade estrutural do serviço; não tente corrigir instalando `package.json`.

O Blueprint deixa `DATABASE_URL` e `WEB_ORIGINS` para preenchimento manual. Use um
PostgreSQL isolado e uma URL no formato `postgresql+psycopg://...?...sslmode=require`.
A URL do banco permanece somente no backend. Depois de salvar as variáveis, execute
um novo deploy e confira `/health/live`.

## Vercel: front-end separado

Depois que o serviço Render estiver disponível, crie um **novo projeto Vercel**
para o mesmo repositório e branch. Configure:

| Campo | Valor |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | `Other` ou sem framework |
| Build Command | vazio |
| Output Directory | vazio |

O diretório contém HTML/CSS/JavaScript estáticos e uma função Node em
`frontend/api/[...path].js`. Essa função encaminha `/api/*` ao Render e envia a
senha Basic apenas no servidor. Em **Preview** e/ou **Production**, conforme o
ambiente que for testar, cadastre na Vercel:

```env
RENDER_BACKEND_URL=https://app-fatec.onrender.com
STAGING_ACCESS_PASSWORD=mesmo-valor-secreto-usado-no-Render
```

As duas são variáveis do servidor; `STAGING_ACCESS_PASSWORD` deve ser do tipo
Secret. Não coloque `DATABASE_URL` na Vercel e não crie `NEXT_PUBLIC_*` para esse
segredo.

No Render, amplie `WEB_ORIGINS` para conter o endereço estável da Vercel e o
endereço do Render, por exemplo:

```env
WEB_ORIGINS=https://app-fatec.vercel.app,https://app-fatec.onrender.com
WEB_APP_URL=https://app-fatec.vercel.app
```

Use o domínio real que a Vercel fornecer. Não use curingas, caminhos ou barra no
final. O domínio da Vercel deve estar em `WEB_ORIGINS` porque o servidor valida a
origem e o CSRF.

Se o Microsoft Entra for ativado com o proxy, registre:

```env
MICROSOFT_REDIRECT_URI=https://app-fatec.vercel.app/api/v1/microsoft/callback
```

Esse endereço também precisa aparecer em `WEB_ORIGINS` pela origem, sem o caminho.
Depois de alterar variáveis nos dois provedores, faça novo deploy em ambos. Abra o
endereço da Vercel para usar o painel; o Render continua sendo a API e pode ser
testado separadamente em `/health/live`.

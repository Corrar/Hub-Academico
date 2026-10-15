# Front-end Vercel

Este diretório contém o painel estático. A API e o banco continuam no Render e
no Neon. O arquivo `api/proxy.js` faz um proxy server-side para o backend.
O `vercel.json` encaminha explicitamente `/api/v1/:path*` para essa função:
o navegador nunca recebe a senha `STAGING_ACCESS_PASSWORD` usada na proteção da
homologação.

## Configuração da Vercel

Crie um projeto separado apontando para a mesma branch, com **Root Directory**
`frontend`, framework `Other`/sem framework e sem comando de build. Adicione,
somente como variáveis do servidor Vercel:

```env
RENDER_BACKEND_URL=https://app-fatec.onrender.com
STAGING_ACCESS_PASSWORD=mesmo-valor-secreto-do-Render
```

O valor de `STAGING_ACCESS_PASSWORD` deve ser do tipo Secret. Não o prefixe com
`tester:` e não o coloque em HTML, JavaScript ou CSS. O proxy adiciona a
autorização Basic apenas na chamada server-side para o Render.

No Render, atualize `WEB_ORIGINS` incluindo o domínio estável da Vercel, por
exemplo `https://app-fatec.vercel.app`, além de
`https://app-fatec.onrender.com`. Configure também:

```env
WEB_APP_URL=https://app-fatec.vercel.app
```

Use o domínio real do seu projeto. Preview URLs aleatórias não devem ser usadas
como curingas; adicione-as individualmente ou teste pelo domínio estável.

Se o Microsoft Entra for ativado, registre no Entra e no Render:

```env
MICROSOFT_REDIRECT_URI=https://app-fatec.vercel.app/api/v1/microsoft/callback
```

O domínio Vercel também precisa estar em `WEB_ORIGINS`. O login será processado
pelo Render através do proxy, e o cookie será salvo no domínio Vercel.

## Manutenção da interface

A fonte editável de HTML, CSS e JavaScript fica em `backend/app/static/`.
Após editar, execute na raiz do repositório:

```sh
node scripts/sync-frontend.mjs
node scripts/sync-frontend.mjs --check
```

Inclua `backend/app/static/` e `frontend/` no mesmo commit. O verificador de CI
bloqueia diferenças entre as cópias. A sincronização só ajusta o caminho dos
assets no HTML; a função em `api/` e as variáveis do servidor são preservadas.
A fonte Plus Jakarta Sans é servida localmente, com sua licença OFL incluída.

Os testes de componentes usam DOM simulado, sem credenciais ou serviços externos:

```sh
npm ci --prefix frontend-tests
npm test --prefix frontend-tests
```

Para a homologação desta revisão, publique o backend e o frontend da mesma
branch: a página inicial e o calendário utilizam duas novas consultas da API.
Não há novas variáveis nem migração de banco nesta alteração visual.

## Erro 404 no login e primeiro acesso

Se `/api/v1/auth/options` responder `NOT_FOUND` da Vercel, confira se o deploy
contém a função `api/proxy.js` e as regras deste `vercel.json`. Não basta publicar
somente os arquivos estáticos. A resposta do proxy inclui `X-Hub-Proxy: render-v1`;
com configuração válida, o endpoint responde JSON com `local` e `microsoft`.
Um 503 com esse cabeçalho indica que a função foi localizada e a configuração
precisa ser verificada. O erro de rota não deve ser contornado liberando login local.

Não existe usuário ou senha padrão. Os valores desenhados no formulário são
placeholders, e `STAGING_ACCESS_PASSWORD` protege a comunicação entre serviços;
ela não é senha de usuário.

Para homologação sem Microsoft, um operador autorizado pode criar a primeira
conta de coordenação no terminal do backend, com as variáveis do banco configuradas:

```sh
python -m app.cli bootstrap --email coordenacao.teste@fatec.sp.gov.br --name "Coordenação de homologação"
```

O terminal solicita a senha sem exibi-la. Esse comando recusa outro coordenador
se já houver um e não concede privilégios de desenvolvedor/admin. Para o primeiro
administrador Microsoft, siga `docs/MICROSOFT-ADMIN.md` na raiz do repositório.

# Front-end Vercel

Este diretório contém o painel estático. A API e o banco continuam no Render e
no Neon. O arquivo `api/[...path].js` faz um proxy server-side para o backend:
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

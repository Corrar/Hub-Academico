# Reconstrução do design do Hub Acadêmico

Data: 09/09/2026. Branch: `melhoria/design-original-e-experiencia`.

## Referência e correção

A interface anterior aplicava o painel genérico de coordenação aos três perfis.
Esta revisão recupera as composições distintas do ZIP `Hub-Academico-main(1).zip`:

- Aluno: composição móvel de até 460 px, cartões vermelhos, busca, atalhos,
  contadores, aulas do dia, eventos e navegação inferior.
- Professor: composição móvel, destaque azul para avaliações pendentes e
  cartões das turmas vinculadas.
- Coordenação: trilho lateral azul de 248 px, páginas amplas, “Precisa de você”,
  “Publicado recentemente”, tabelas e formulários de gestão.
- Login: cabeçalho azul, área branca arredondada, campos com ícones e acesso
  Microsoft quando habilitado pelo backend.

Foram reutilizados os logotipos e as ilustrações originais. A tipografia Plus
Jakarta Sans, pesos 200–800, é servida localmente em WOFF2, com licença OFL.
As cores, raios e espaçamentos vêm das fontes do ZIP. Cinzas com contraste
insuficiente continuam substituídos pelos tons acessíveis do próprio design.
Não há garantia de equivalência pixel a pixel: a prévia visual local foi bloqueada
pela política do navegador disponível. A conferência visual na nuvem segue pendente.

## Funcionalidades desta revisão

| Área | O que foi entregue |
| --- | --- |
| Início | Contagens reais de turmas, materiais, entregas/avaliações pendentes e aulas do dia |
| Turmas | Listagem paginada e acesso a atividades, materiais e horários filtrados por turma |
| Calendário | Navegação mensal, seleção de dia, aulas recorrentes, eventos de vários dias e prazos em Brasília |
| Busca | Busca por título/conteúdo em atividades, materiais, avisos e eventos; paginação por categoria |
| Lembretes | Próximos cinco prazos e oito comunicados/eventos recentes da API |
| Perfil | Identificação da sessão, acessos acadêmicos, administração autorizada, ajuda e saída |
| Apresentação do app | Três passos com as ilustrações do ZIP e navegação funcional |
| Publicações | Cartões por tipo, pesquisa, rascunhos, edição, arquivamento, detalhes e anexos |
| Atividades | Formulários existentes de rascunho, entrega, avaliação e feedback integrados ao novo visual |
| Eventos | Detalhes, quantidade de inscritos e inscrição/cancelamento sem duplicar diálogos |
| Administração | Usuários, identidades, privilégios, bloqueios, sessões e estado do sistema com o mesmo estilo |
| Manutenção | Arquivos formatados, módulo visual separado e sincronização verificável Vercel/Render |

As telas usam dados retornados pela API. Nomes, notas e contagens fictícias dos
protótipos não são inseridos no banco nem apresentados como informação institucional.
As médias exibidas são das atividades do hub; não são notas oficiais.

## Segurança e limites

As consultas novas (`GET /api/v1/learning/overview` e `GET
/api/v1/learning/calendar?month=AAAA-MM`) exigem sessão e respeitam os vínculos
vigentes e a hierarquia acadêmica. Rascunhos e registros arquivados não entram
no calendário ou na página inicial. Filtrar uma turma não amplia a autorização.
O calendário limita a resposta a 500 publicações e 500 horários por mês e avisa
quando houver mais registros. As listagens completas continuam paginadas.

Os valores são inseridos como texto no DOM. As mutações mantêm cookies de sessão
e CSRF. Não foram adicionados segredos, dados pessoais reais, scripts externos
ou flexibilizações de CSP. O navegador continua acessando a API pelo proxy da Vercel.

## Validação e aceite

Resultado local desta revisão: **69 testes de backend passaram, 2 foram pulados;
4 testes de interface passaram**. Ruff, sintaxe JavaScript e verificação de
sincronização também passaram. Os dois testes pulados pertencem à suíte anterior
e dependem de condições específicas do ambiente; não equivalem a testes aprovados.

- Testes de API cobrem escopo por turma, rascunhos, arquivamento da hierarquia,
  entregas, avaliações e fronteira de mês entre UTC e Brasília.
- Testes de componentes exercitam os três perfis, permissão administrativa,
  filtros, conteúdo que tenta injetar HTML, calendário, busca, expiração de sessão
  e envio de CSRF na inscrição.
- O CI verifica a sintaxe JavaScript, a sincronização dos arquivos e executa as
  suítes de backend e interface. SQLite é testado localmente; PostgreSQL tem um
  job próprio no GitHub Actions e depende da execução após a publicação.
- Testes em DOM simulado não substituem conferência visual em tela real,
  leitor de tela ou teste do login Microsoft com a instituição.
- Pentest remoto não foi executado nesta etapa.

Para o aceite em nuvem, publicar esta revisão nos dois serviços; usar o frontend
da Vercel com Root Directory `frontend`; testar login, cada perfil, uma entrega,
uma avaliação, inscrição e saída em celular e desktop. Não há nova variável de
ambiente ou migração de banco nesta revisão.

## O que ainda depende de implementação ou informação

| Pendência | Informação/decisão necessária |
| --- | --- |
| Login Microsoft real e primeiro admin | Tenant, registro do aplicativo, callback aprovado, política MFA e Object ID verificado do administrador; segredos somente no provedor |
| Dados acadêmicos oficiais | Cursos, disciplinas, turmas, horários, responsáveis e vínculos aprovados pela instituição |
| Frequência/chamada | Regra institucional, responsável pelo lançamento e definição da fonte oficial; esta revisão não cria presença fictícia |
| Mapa da unidade | Planta/localização autorizada e cadastro de ambientes; mapa não implementado |
| Notificações push | Provedor, consentimento, tokens de dispositivos e serviço de envio; lembretes atuais funcionam dentro do app |
| Anexos PDF/imagem/Office | Armazenamento privado, análise de arquivos e limites aprovados; permanece o suporte existente a TXT de até 512 KiB |
| Integração Teams/sistema acadêmico | APIs disponíveis, autorização do tenant e escopos permitidos |
| Aplicativo Android/iOS | Empacotamento nativo, testes de dispositivos, contas de publicação e distribuição; a entrega atual é web responsiva |
| Operação institucional | Retenção, backup/restauração ensaiada, monitoramento, revisão de dependências, política de acesso e aceite dos responsáveis |

O produto está preparado para continuar a homologação; as pendências acima
impedem classificá-lo como sistema institucional completo ou pronto para produção.

## Ajuste de fidelidade — 10/09/2026

O login recupera a marca tipográfica sem caixa branca, as medidas do cabeçalho,
campos, botões, separador Microsoft e rodapé das fontes do ZIP. A navegação
inferior recupera os cinco atalhos originais, sem arredondamento ou fundo no
item ativo. O perfil recupera alinhamento, avatar e cartões da referência;
as três telas de apresentação recuperam composição, títulos e ilustrações.
O calendário permanece acessível pelo perfil.

Uma falha de `/auth/options` mantém os controles visíveis, desabilita os métodos
de acesso e oferece nova tentativa. Apenas os métodos autorizados pelo backend
são habilitados após a conexão; o modo Microsoft não libera senha local.
A ajuda de acesso permanece disponível durante falhas. Isso corrige a tela
vazia, mas não comprova a resolução do erro de conexão do ambiente em nuvem.

Validação desta atualização: sete testes de interface, sintaxe JavaScript e
sincronização do frontend. A conferência visual em navegador continua pendente,
pois a política do navegador disponível bloqueou a prévia local. Não foi
confirmada igualdade pixel a pixel nem realizado pentest remoto nesta etapa.

## Abertura e apresentação antes do login — 10/09/2026

- A abertura apresenta a marca Fatec centralizada sobre fundo branco durante
  700 ms. A consulta de autenticação ocorre em paralelo e não bloqueia a apresentação.
- No primeiro acesso anônimo, as três ilustrações aparecem antes do login,
  com avanço e opção de pular. Concluir ou pular registra somente a preferência
  `fatec:onboarding-completed:v1` no navegador, sem credenciais ou dados da sessão.
- Nas próximas aberturas, a apresentação é dispensada; continua acessível pelo
  perfil. Sessões já reconhecidas também seguem diretamente para o aplicativo.
- Bloqueio do armazenamento e indisponibilidade da API não impedem sair da
  apresentação. Nenhum método de autenticação é liberado por essa preferência.
- O HTML do formulário de login foi comparado com a versão aprovada e permaneceu
  integralmente igual. As regras de estilo do login não foram alteradas.
- Dez testes de interface passaram, incluindo primeiro acesso, retorno, avanço,
  opção de pular, armazenamento indisponível e API sem resposta. Sintaxe JavaScript,
  sincronização Vercel/Render e verificação de diferenças também passaram.

A comparação visual em navegador publicado permanece pendente.

## Correção da rota de autenticação na Vercel — 10/09/2026

A consulta pública de `/api/v1/auth/options` em `hub-academico.vercel.app`
retornou 404 `NOT_FOUND` da plataforma; a origem Render respondeu 401
`Homologação restrita`, como esperado sem a credencial entre serviços. Esses
resultados não comprovam quais contas existem no banco nem o modo de login ativo.

O proxy passou de `api/[...path].js` para `api/proxy.js`, com encaminhamento
explícito de `/api/v1/:path*` no `frontend/vercel.json`. A origem configurada
deve usar HTTPS; caminhos são limitados à API versionada. Cookies, CSRF e senha
de homologação no servidor são preservados. Não houve alteração visual.

Treze testes locais passaram: dez de interface e três de proxy, cobrindo a rota
de autenticação, a preservação de corpo/query/cookies/CSRF e a rejeição de caminhos
fora da API. A execução real da função deve ser confirmada após o novo deploy.
O procedimento do primeiro acesso está documentado no `frontend/README.md`.

Referência técnica: https://vercel.com/docs/routing/rewrites

## Campos editáveis durante a conexão

Os campos de e-mail/senha e a opção de mostrar senha agora funcionam mesmo
durante falhas da API. Somente os botões de autenticação dependem da confirmação
dos métodos aceitos. Submissões por senha continuam bloqueadas quando o serviço
está indisponível ou aceita somente Microsoft. Treze testes passaram, incluindo
tentativa de envio durante falha e manutenção da autenticação Microsoft exclusiva.

Na conferência pública seguinte, `/api/v1/auth/options` ainda retornava 404;
`/api/proxy?__hub_path=auth/options` retornou 503 `Proxy da homologação não
configurado`. É necessário publicar a revisão e configurar ambas as variáveis
do servidor Vercel: `RENDER_BACKEND_URL` e `STAGING_ACCESS_PASSWORD`. A segunda
usa o mesmo segredo do Render e não representa uma senha de conta do aplicativo.

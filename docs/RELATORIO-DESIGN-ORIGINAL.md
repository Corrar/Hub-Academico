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

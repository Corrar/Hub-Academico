# Relatório de revisão — Hub Acadêmico

Data: 09/09/2026. Branch: `melhoria/revisao-e-fluxos-academicos`.

## Resultado e limites

A revisão abrangeu a composição da API, autenticação local/Microsoft, concessões
administrativas, autorização dos cadastros, dados/migrações, recuperação local,
proteções de homologação, interfaces web, entradas Vercel e testes automatizados.
As referências visuais foram identificadas como protótipos, preservadas e mantidas
fora do aplicativo servido. O código acadêmico que estava incompleto foi integrado.

**O sistema não está integralmente concluído nem validado para produção.** Esta
entrega amplia a versão de homologação. Não houve deploy, configuração real do
Entra, provisionamento da conta do responsável, QA no navegador ou pentest remoto.
A revisão não é uma certificação de ausência de vulnerabilidades.

A `main` consultada ainda contém o protótipo inicial (`e393d9f`). As melhorias
estão em branches/PRs encadeados. Publicar essa `main` continua sem incluir a API.
A nova branch contém as entregas anteriores e usa o build Python/FastAPI.

## O que está implementado

| Área | Funcionalidade entregue | Limite importante |
| --- | --- | --- |
| Base acadêmica | Cursos, disciplinas, turmas, usuários e vínculos com vigência | Exige cadastro inicial pela coordenação |
| Perfis | Aluno, professor e coordenação, com escopo no servidor | Permissões dependem de vínculos ativos |
| Microsoft | OIDC single tenant, PKCE, nonce, assinatura, audiência e emissor | Registro e ativação no Entra pendentes |
| Desenvolvedor/admin | Identidades, permissões, bloqueio, sessões, revogação global e estado do sistema | Primeiro admin exige Object ID verificado e MFA; nenhuma conta real foi criada |
| Painel acadêmico | Navegação por perfil, formulários, listagens e mensagens de erro | QA visual/dispositivos pendente |
| Publicações | Atividades, materiais, avisos e eventos com público, rascunho, publicação, busca, versão e arquivamento | Agendamento automático ainda ausente |
| Entregas | Rascunho privado, envio/reenvio antes do prazo, avaliação, feedback e reabertura | Reabertura da nota não prorroga automaticamente o prazo da atividade |
| Média | Média das atividades avaliadas no hub | Não representa nota oficial |
| Eventos | Inscrição, cancelamento e limite de vagas | Não envia push ou e-mail |
| Grade | Horário semanal, vigência, sala e conflitos por turma/professor | Não registra chamada nem frequência |
| Matrículas em lote | Até 100 e-mails, turma e vigência; prévia, erros por linha e aplicação atômica | As contas precisam existir; não provisiona identidades em massa |
| Anexos | Upload/download privado, limites, arquivamento e restauração por API | Somente `.txt` UTF-8, 512 KiB, dez por registro incluindo arquivados |
| Dados | Migração `0003`, auditoria transacional e recuperação SQLite | Restauração do PostgreSQL hospedado ainda precisa ser ensaiada |
| Nuvem | Entradas Vercel para raiz ou `backend/`, staging protegido, PostgreSQL/TLS | Preparação de código não equivale a deploy |
| Front-end separado | Pasta `frontend/` para Vercel, proxy server-side para Render e cookies preservados | Requer novo projeto Vercel, domínio estável e duas variáveis server-side |

## Achados da revisão e correções

A classificação abaixo é de revisão de código; não resulta de exploração de um
ambiente institucional.

| Achado | Impacto | Tratamento |
| --- | --- | --- |
| Novos módulos ainda não registrados na aplicação nem migrados | Funcionalidades inacessíveis e banco sem tabelas | Pacote `academic/`, instalação das rotas e migração `0003`; prontidão e restauração atualizadas |
| Importação dinâmica dependia do nome `app` | Falha quando a Vercel importa via `backend.app` | Imports relativos e separação de contratos/regras |
| Erro do login Microsoft ficava dentro do formulário local oculto | Usuário sem orientação quando o login falhava | Mensagem de erro movida para fora do formulário |
| Painel local bloqueava aluno/professor mesmo com novos módulos | Impossibilidade de testar esses perfis sem Entra | Login local de contas provisionadas dos três perfis; Microsoft configurado continua desativando o login local |
| Limite de fluxos OIDC usava contagem e inserção sem serialização | Requisições concorrentes poderiam ultrapassar o limite por origem de rede | Lock transacional por origem no PostgreSQL |
| Alteração concorrente de entrega durante operação em anexo | Possível alteração após envio/avaliação no código em preparação | Lock da publicação e releitura da entrega antes da escrita |
| Upload mantinha lock enquanto recebia os bytes e fazia I/O de banco no loop assíncrono | Contenção e bloqueio desnecessário do servidor | Limite durante leitura, autorização final sob lock e acesso ao banco no pool de threads |
| Restauração de grade mudava o estado antes da validação/auditoria | Histórico incorreto e risco de conflito | Validação antes da restauração, lock compartilhado e registro do estado anterior |
| Conflito de professor ignorava a interseção das vigências | Bloqueio indevido de horários antigos/futuros | Considera datas de ambos os vínculos e ocorrência do dia da semana |
| Alterar vínculo/perfil podia criar conflito após cadastrar a grade | Sobreposição de aulas não detectada | Validação também em vínculo, lote, restauração e alteração administrativa de perfil |
| Interface administrativa concentrada em um único arquivo | Manutenção mais difícil | Extração de `admin.js`; fluxos novos em `academic.js`; mapa de responsabilidades |
| Documentos descreviam etapas já superadas | Expectativa incorreta sobre estado e deploy | Índice, roteiro atual e este relatório |

Controles existentes preservados: sessão opaca e revogável, cookie HttpOnly,
SameSite e Secure; CSRF com origem exata; dados renderizados como texto; CSP;
provisionamento explícito; MFA e autenticação recente para operações de admin;
auditoria protegida contra UPDATE/DELETE; produção bloqueada.

## Verificação realizada

- Suíte local: **65 testes aprovados, 2 ignorados por dependerem de PostgreSQL**.
- Regressões novas: isolamento de rascunho/entrega/arquivo, papel e turma,
  prazo, reabertura/nota/versão, capacidade/cancelamento, grade/vigência e lote.
- Teste concorrente da última vaga incluído para PostgreSQL na CI.
- Ruff: análise estática e formatação aprovadas.
- JavaScript: verificação de sintaxe dos três arquivos.
- Migração: teste de atualização a partir da base antiga, preservação dos dados e
  comparação entre esquema e metadados.
- CI da nova branch: **SQLite e PostgreSQL aprovados**, incluindo migrações e
  concorrência de vagas. [Execução 34341380810](https://github.com/Corrar/Hub-Academico/actions/runs/34341380810),
  código verificado no commit `604cd5f1bc7f6ee9cc24aba6daec34ac79bd923d`.

Os avisos de depreciação do adaptador TestClient/httpx foram observados; a suíte
passa. Não foi feita auditoria online de CVEs nesta revisão. Não houve teste visual,
de carga, leitor de tela ou exploração remota. São verificações diferentes.

## O que ainda precisa ser desenvolvido

| Pendência | Situação / dependência |
| --- | --- |
| App Expo Android/iOS | Ainda não implementado; trabalho de código pendente, não bloqueado apenas por informações do usuário |
| Calendário consolidado e agenda pessoal | Atividades e eventos têm datas; falta a visão consolidada |
| Push e publicações agendadas | Faltam fila, worker, preferências, retentativas e deduplicação; depende também de projeto móvel e credenciais de push |
| PDF/Office/imagens | Definir armazenamento privado, scanner, quotas e retenção antes de ampliar formatos |
| Chamada/frequência | Aguarda definição da fonte oficial, regra de aula/hora-aula e responsabilidade por retificações |
| Administração operacional completa | Configurações autorizadas, alertas, revogação individual e recuperação supervisionada ainda incompletos |
| Acessibilidade e UX | Navegação por teclado, leitores de tela, contraste e telas móveis precisam de QA real |
| Proteções operacionais | Limites globais de requisição/corpo, monitoramento, alertas, orçamento, gestão/rotação de segredos e revisão de dependências |
| Governança de dados | Retenção, finalidade, acesso excepcional, atendimento ao titular e responsabilidades da instituição |
| Homologação real | Entra, banco, migração, deploy, teste de restauração e roteiro de aceite por perfil |
| Front-end Vercel separado | Criar projeto com Root Directory `frontend`, configurar proxy e domínio em `WEB_ORIGINS` |
| Pentest | Aguardando a confirmação solicitada pelo usuário; não executado |

A revisão de código não cobre a configuração efetiva de proxy/WAF, política Entra,
privilégios do banco, backups do provedor ou segurança de dispositivos. Esses
itens precisam ser verificados no ambiente antes de usar dados reais.

## Informações e acessos necessários do responsável

| Fornecer ou confirmar | Para quê |
| --- | --- |
| URL da homologação e branch/commit implantado | Validar que o serviço usa esta implementação, não apenas o protótipo |
| Provedor e projeto de hospedagem/PostgreSQL | Preparar a configuração e testar operação/restauração sem tocar produção |
| Tenant ID, Client ID e redirect URI do Entra | Ativar o fluxo Microsoft para a origem HTTPS correta |
| Contexto Entra `c1`–`c99` e política de MFA associada | Garantir que o administrador autentique com a política exigida |
| Seu nome, e-mail institucional e Object ID verificado no Entra | Provisionar o primeiro administrador sem inferir identidade pelo GitHub |
| Contas fictícias por perfil e estrutura de turmas de teste | Executar roteiro de homologação com dados sintéticos |
| Fonte oficial de frequência e regras de presença/retificação | Construir chamada sem inventar registro oficial ou duplicar fluxo sem acordo |
| Tipos/tamanhos de arquivos, volume de alunos e retenção | Dimensionar uploads, banco e armazenamento |
| Responsável institucional e decisões de retenção/backup | Definir operação, governança e aceite para uso real |
| Conta/projeto Expo e identificadores Android/iOS, na etapa móvel | Build, push e distribuição de teste |

**Não envie senhas pessoais, client secret ou URL do banco com senha na conversa.**
Insira os segredos nas variáveis protegidas da hospedagem. Posso orientar os nomes
e conferir a configuração sem exibir os valores. As variáveis estão documentadas
em [Microsoft/admin](MICROSOFT-ADMIN.md) e [homologação](HOMOLOGACAO-VERCEL.md).

## Pentest após confirmação

Nenhum ataque remoto foi executado. Quando você confirmar que a homologação está
na nuvem, precisamos do domínio exato autorizado, confirmação de controle do
ambiente e contas sintéticas dos perfis que serão avaliados. A avaliação ficará
restrita ao Hub de homologação; Microsoft, CPS e infraestrutura de terceiros não
passam a ser alvos autorizados por esse teste.

Roteiro proposto: sessão/autenticação, autorização horizontal e vertical, CSRF,
validação de entradas, uploads/downloads privados, prazos, concorrência de vagas,
revogação de permissões e exposição de dados. O resultado deverá registrar achado,
impacto, reprodução controlada, correção e reteste. Carga e testes destrutivos
exigem escopo adicional explícito.

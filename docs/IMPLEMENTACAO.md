# Roteiro de implementação — 08/09/2026

## Entrega 1: base acadêmica (esta branch)

API Python/FastAPI, modelos SQLAlchemy, primeira migração Alembic, contas locais
provisionadas, sessões revogáveis, permissões, cursos, disciplinas e ofertas,
vínculos temporais, arquivamento/restauração, auditoria, backup/restauração SQLite
e testes. O OpenAPI é a superfície executável para validar a API antes do painel.

Escolhas de implementação desta entrega: Python, SQLAlchemy e PostgreSQL como
alvo; SQLite para desenvolvimento. Expo e o painel web continuam conforme o
produto. Login local é uma ferramenta provisória de teste, não uma decisão
sobre autenticação institucional. Nenhum serviço foi contratado ou publicado.

## Entrega 2: painel da coordenação conectado

Implementado em `/panel/`, servido pelo FastAPI: visão geral com dados reais,
criação/edição de cursos, disciplinas e ofertas, provisionamento local de usuários,
vínculos com vigência, arquivamento/restauração e consulta de auditoria. Listagens
paginadas e seletores com busca e carregamento de mais opções. A identidade visual
segue as referências existentes, sem carregar o runtime do editor.

Sessão web em cookie HttpOnly/SameSite=Strict/Secure por padrão, 30 minutos,
rotação no login e revogação no logout; Origin e CSRF verificados no servidor.
CSP do painel recusa código inline e recursos externos; dados são renderizados
como texto. Respostas de validação omitem os inputs, inclusive senhas.
A API Bearer e suas verificações por papel/objeto permanecem disponíveis.

Verificação: 25 testes automatizados locais aprovados, incluindo sessão web,
CSRF, origem, isolamento, persistência, auditoria e recuperação. Nenhuma validação
visual em navegador foi realizada; teclado, leitores de tela e responsividade
precisam de revisão. Sem alteração do esquema do banco nesta entrega.

## Próximas entregas

1. **Complementos da gestão acadêmica:** períodos/coortes, grade horária e
   matrícula em lote com prévia, erros por linha e prevenção de duplicidade.
   Validar acessibilidade e uso do painel com a coordenação.
2. **Identidade institucional:** registrar aplicação Microsoft/Entra com a
   instituição, validar emissor/audiência/tenant e identidade verificada, vincular
   conta a usuário aprovado e definir atribuição/revogação de papéis. Só verificar
   o domínio do e-mail não equivale a autenticar pela Microsoft.
3. **Professor → aluno:** atividade por ID, prazo do servidor, rascunho/publicação,
   upload privado, envio/reenvio de entrega, avaliação e devolutiva. Testar acesso
   cruzado a arquivo e entrega antes de incluir documentos reais.
4. **App Expo:** reproduzir o design, conectar os perfis, implementar calendário
   real, busca, materiais, estados vazios/erro/offline e média das atividades do hub.
5. **Avisos e eventos:** público-alvo, rascunho, publicação/agendamento, inscrição
   e limites de vagas; push com preferências, tentativas e deduplicação.
6. **Chamada e frequência:** confirmar a origem institucional e a regra por
   aula/hora-aula; implementar retificação auditada e visualização por disciplina.
7. **Piloto institucional:** configurar operação PostgreSQL, login institucional,
   observabilidade, limites de upload, armazenamento, retenção, rotina de backup
   com restauração testada e revisão de acessibilidade nas telas implementadas.

## Acesso do desenvolvedor/admin — incluído a pedido do responsável

Planejar e implementar um quarto papel, `platform_admin`, separado da coordenação,
para Bruno Roberto Corral administrar o Hub. **Não existe conta especial, senha
padrão, endpoint de bypass ou privilégio oculto nesta entrega.** A identidade
institucional exata será confirmada na etapa de provisionamento, sem inferi-la do
nome ou do usuário GitHub.

1. **Identidade e primeiro acesso:** login institucional OIDC/Entra (tenant,
   emissor, audiência, nonce/PKCE e identificador imutável validados). MFA
   obrigatório, preferencialmente resistente a phishing, exigido pelo provedor
   e verificado por política de autenticação. Sem cadastro público de admin e
   sem promoção por conta comum/coordenação. Bootstrap excepcional deve ser
   controlado, único e auditado; não transportar credenciais em código/URLs.
2. **Console de administração:** usuários e convites, atribuição/revogação de
   papéis, estrutura acadêmica, configurações autorizadas, sessões/dispositivos,
   trilha de auditoria e saúde operacional. Permissões explícitas por ação,
   verificadas no servidor; papel admin não é um bypass universal das regras.
   Acesso excepcional a dados acadêmicos deve ter finalidade e registro.
3. **Operações críticas:** reautenticação/MFA recente para promover administradores,
   exportar dados, alterar configurações de segurança e executar recuperação.
   Registrar ator, alvo, justificativa, resultado e alterações sem segredos.
   Proteger o último administrador ativo; aprovações adicionais para mudanças
   críticas conforme a governança acordada com a instituição.
4. **Sessões e recuperação:** revogação global/por dispositivo, encerramento por
   inatividade e limite absoluto, alertas de novos acessos, recuperação fora de
   banda e procedimento de emergência com credenciais guardadas e uso auditado.
   O admin da aplicação não recebe senhas do banco ou acesso à infraestrutura.
5. **Aceite de segurança:** testes de escalada horizontal/vertical, MFA ausente,
   CSRF/XSS, revogação imediata de papéis/sessões e proteção de auditoria;
   revisão independente e simulação de recuperação antes de dados reais.

Antes de liberar produção: controles concorrentes/distribuídos de tentativas,
HTTPS, privilégios mínimos separados no banco, gestão de segredos, logs de
segurança com retenção e alertas, dependências verificadas e restauração testada.
Manter o bloqueio de produção até a verificação da identidade institucional,
MFA do administrador e aceite da instituição. O `.env` de desenvolvimento não
habilita nenhuma dessas garantias automaticamente.

## Critério do painel conectado

A coordenação consegue criar a estrutura e matricular um aluno pelo painel; o
professor associado e o aluno matriculado veem a mesma oferta; outra conta não
consegue consultá-la. A operação sobrevive ao reinício e aparece na auditoria.

## Observações verificadas no protótipo

O aluno ainda tem login simulado, upload fictício, detalhe de atividade único,
estado compartilhado entre entregas e datas fixas. Os arquivos de design não
foram convertidos nem corrigidos nesta etapa; são referência para reconstrução.
As telas novas referenciam runtime do editor, sem ser um projeto de app executável.
`docs/auditoria.html` é histórico; não deve ser usado como indicador atual de progresso.

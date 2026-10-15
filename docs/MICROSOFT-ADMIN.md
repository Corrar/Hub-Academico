# Microsoft institucional e administração

## Estado desta entrega

Implementados: login web Microsoft OIDC de tenant único; console administrativo
para provisionar usuários, vincular identidades, atribuir/revogar privilégios,
bloquear contas e revogar sessões; consulta de sessões e estado do ambiente.
A coordenação mantém os cadastros acadêmicos. Alunos/professores autenticados
pela Microsoft têm uma tela web de turmas com vínculo vigente.

Não foi realizada autenticação real no tenant da Fatec, nem deploy ou teste visual
em navegador. Código e testes de protocolo não significam autorização institucional.
A integração exige registro do aplicativo, segredo, callback e política Entra.
Não há conta admin padrão, e-mail inferido ou senha administrativa reutilizável.

## Configuração no Microsoft Entra

Um administrador autorizado do tenant da Fatec precisa:

1. Registrar aplicativo **Web, single tenant**. Não usar `common`, `organizations`
   nem permitir contas Microsoft pessoais. Anotar Directory (tenant) ID e
   Application (client) ID.
2. Registrar exatamente `https://SEU-DOMINIO/api/v1/microsoft/callback` como redirect
   URI Web. Não habilitar fluxo implícito. O backend troca o código com PKCE S256
   e segredo confidencial, sem expor segredo ou token Microsoft no frontend.
3. Criar um segredo com expiração e definir a rotina de rotação. Cadastrar o valor
   apenas nas variáveis secretas da hospedagem. Nunca enviar o segredo pelo chat
   ou colocá-lo no repositório. Certificado em substituição ao segredo é evolução
   operacional futura, não um recurso desta implementação.
4. Publicar um contexto de autenticação, por exemplo `c1`, e associar uma política
   de Conditional Access que **exija MFA**, preferencialmente resistente a phishing.
   Verificar licenças necessárias, cobertura da política e ausência de exclusões
   indevidas. O código exige o contexto no token do administrador; a garantia de
   MFA depende de esse contexto estar efetivamente vinculado à política correta.
5. Conferir consentimento e atribuição de usuários ao aplicativo conforme a política
   da instituição. O aplicativo solicita somente `openid profile email`, sem Graph,
   sem acesso a Teams/e-mails e sem refresh token/offline_access.
6. Obter o **Object ID do usuário Bruno no mesmo tenant**, conferido pelo responsável
   institucional. Esse identificador, junto do tenant ID, identifica sua conta.
   Nome de usuário GitHub, e-mail e nome visível não concedem privilégios.

## Variáveis da hospedagem

Além das variáveis de staging em `HOMOLOGACAO-VERCEL.md`, configure:

| Variável | Conteúdo |
| --- | --- |
| `MICROSOFT_TENANT_ID` | UUID do tenant autorizado |
| `MICROSOFT_CLIENT_ID` | UUID do aplicativo Web |
| `MICROSOFT_CLIENT_SECRET` | Valor secreto criado no Entra |
| `MICROSOFT_REDIRECT_URI` | Callback HTTPS exato registrado no Entra |
| `MICROSOFT_AUTH_CONTEXT` | Contexto com política MFA efetiva, como `c1` |

O domínio do callback precisa estar em `WEB_ORIGINS`, sem barra final na origem.
`WEB_SECURE_COOKIE=true` é obrigatório. Configuração Microsoft parcial impede
inicialização. Ao configurar o provedor, login por senha local e provisionamento
local pela coordenação ficam desativados; identidades existentes precisam ser
vinculadas pelo administrador. Sessões locais não dão acesso após a ativação.

A prévia continua com sua proteção adicional de homologação. Configure também
os controles da hospedagem para não expor dados de teste publicamente.

## Migração e primeiro administrador

Antes do deploy, faça backup do banco de homologação e instale as dependências
atualizadas. Na pasta `backend`, com o ambiente configurado e a venv ativa:

```sh
alembic upgrade head
alembic check
python -m app.bootstrap_admin --email SEU_EMAIL_INSTITUCIONAL --name "Bruno Roberto Corral" --object-id UUID_CONFIRMADO_NO_ENTRA
```

Os marcadores acima devem ser substituídos por valores reais conferidos. Não
execute com valores presumidos. Use um único operador responsável. A rotina só
cria o primeiro administrador e recusa e-mail já cadastrado: não associa conta por
coincidência de e-mail. Se houver conflito, resolver a identidade em procedimento
supervisionado, sem editar concessões diretamente para contornar essa verificação.

A migração `0002` preserva usuários, cursos e auditoria, mas **revoga todas as sessões
existentes** porque elas não têm procedência de autenticação. Cria tabelas de
identidades Microsoft, concessões administrativas e estados OIDC temporários.
Downgrade destrutivo é recusado; recuperação deve usar backup revisto.
Migração e bootstrap não são executados automaticamente em builds/functions.

Depois do provisionamento, entre pelo botão Microsoft. O servidor só concede
sessão administrativa se identidade, tenant, assinatura, validade, nonce e contexto
exigido forem confirmados. O e-mail que a Microsoft retornar nunca é usado para
vincular automaticamente uma conta.

## Operação do console

- **Administração de usuários:** provisionar uma conta com seu Object ID verificado;
  consultar perfis e bloqueios; atribuir privilégios; vincular uma identidade a um
  cadastro local; revogar todas as sessões de uma pessoa.
- **Sistema e segurança:** prontidão do banco, revisão da migração, configuração
  do login e prazo de sessão. Não mostra segredos nem permite desligar proteções.
- **Auditoria:** alterações administrativas incluem autor, alvo e justificativa;
  o login Microsoft bem-sucedido também é registrado. Tokens, segredos e senhas
  não são incluídos. Log de tentativas Microsoft malsucedidas está no provedor;
  alertas e centralização desses eventos continuam dependentes da operação.

O privilégio administrativo é uma concessão separada em `admin_grants`, vinculada
à identidade Microsoft e ao perfil acadêmico de gestão. A coordenação não pode
criá-la pela API de cadastros. Administradores não alteram o próprio papel, vínculo
Microsoft ou bloqueio; isso preserva o último acesso administrativo ativo. Alterações
administrativas são serializadas no PostgreSQL e revogam sessões do alvo.

Sessão dura no máximo 30 minutos e nunca além da validade do ID token recebido.
Operações do console que alteram dados exigem autenticação Microsoft de até cinco
minutos. Use **Confirmar identidade** para entrar novamente; mudança do contexto
exigido invalida sessões administrativas com contexto anterior. Não há renovação
silenciosa nem armazenamento de tokens Microsoft. O logout encerra a sessão do
Hub, não a sessão Microsoft global ou a proteção HTTP Basic da homologação.

## Verificação necessária antes da liberação

1. Testar usuário provisionado e não provisionado no tenant real.
2. Confirmar MFA/contexto para Bruno; tentativa sem contexto deve falhar.
3. Testar outro tenant, bloqueio, mudança de papel, revogação e autenticação recente.
4. Validar os fluxos no navegador desktop/móvel e acessibilidade.
5. Validar backup/restauração, monitoramento, custos e governança institucional.

**Produção permanece bloqueada.** O sistema acadêmico completo ainda depende dos
módulos de atividades/entregas, anexos privados, calendário/grade, avisos/eventos,
app Expo e definição institucional de frequência. Esta entrega habilita a camada
de identidade e administração; não declara esses módulos prontos.

## Referências de implementação

- https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow
- https://learn.microsoft.com/en-us/entra/identity-platform/developer-guide-conditional-access-authentication-context

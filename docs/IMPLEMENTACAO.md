# Estado da implementação — 15/10/2026

Consulte [a análise de outubro/2026](RELATORIO-ANALISE-2026-10.md) para o
diagnóstico, as decisões, a verificação e as dependências externas.

| Entrega | Estado do código |
| --- | --- |
| Fundação | API FastAPI, cadastros, vínculos, sessões, auditoria e backup SQLite |
| Painel | Interface web conectada e responsiva, navegação e permissões por perfil |
| Homologação | Entradas Vercel/Render, bloqueio de produção, proteção do ambiente, `seed-demo` |
| Microsoft/admin | OIDC single tenant com PKCE, MFA administrativo, identidades e sessões |
| Fluxos acadêmicos | Publicações agendáveis, entregas, avaliação em fila, eventos com inscritos, grade, lote |
| Chamada e frequência | Chamada pelo professor, correção auditada, frequência por disciplina |
| Contas | Troca e redefinição de senha local, edição de usuário, sessão por inatividade |
| Anexos | PDF, Office, imagens, CSV, notebooks e texto com verificação de assinatura |
| Lembretes | Novidades e notas recebidas com não lidos |
| Migração atual | `0004`; executar `alembic upgrade head` antes de iniciar a nova versão |

A existência de código em uma branch não atualiza a `main` nem os serviços da
nuvem automaticamente.

## Pendências de desenvolvimento

- Aplicativo Expo Android/iOS e notificações push (dependem da escolha do canal e
  de credenciais).
- Varredura antivírus e armazenamento de objetos para anexos em volume real.
- Acessibilidade com leitor de tela e testes com usuários.
- Integrações com sistemas do Centro Paula Souza, se houver API autorizada.

## Pendências de ativação

Registro no Entra, Object ID do administrador, política MFA, PostgreSQL isolado,
segredos na hospedagem, migração `0004`, URL de homologação, teste de restauração
do banco hospedado e confirmação da regra oficial de frequência. Não há conta real
provisionada nem deploy realizado por esta execução.

## Aceite de segurança

Testes locais de regressão, revisão estática e roteiro em navegador fazem parte da
entrega. Pentest da nuvem está adiado até a confirmação do usuário e a definição do
alvo autorizado. Produção permanece bloqueada até o aceite institucional e operacional.

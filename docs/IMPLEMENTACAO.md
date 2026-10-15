# Estado da implementação — 16/10/2026

Consulte [a análise de outubro/2026](RELATORIO-ANALISE-2026-10.md) e o
[guia de operação](OPERACAO.md).

| Entrega | Estado do código |
| --- | --- |
| Fundação | API FastAPI, cadastros, vínculos, sessões, auditoria e backup SQLite |
| Aplicativo | Painel web responsivo e instalável (PWA), navegação e permissões por perfil |
| Homologação | Entradas Vercel/Render, bloqueio de produção, proteção do ambiente, `seed-demo` |
| Microsoft/admin | OIDC single tenant com PKCE, MFA administrativo, identidades e sessões |
| Fluxos acadêmicos | Publicações agendáveis, entregas, avaliação em fila, eventos com inscritos, grade, lote |
| Chamada e frequência | Chamada pelo professor, correção auditada, frequência por disciplina, CSV para o diário |
| Notificações | Web Push e canal Expo, preferências, fila deduplicada, retentativas, lembrete de prazo |
| Contas | Troca e redefinição de senha local, edição de usuário, sessão por inatividade |
| Anexos | PDF, Office, imagens, CSV, notebooks e texto; verificação de assinatura e ClamAV |
| Privacidade | Cópia dos dados do titular, aviso de privacidade e retenção automática |
| Operação | Backup e restauração verificada do PostgreSQL, limpeza de dados vencidos |
| Acessibilidade | Auditoria WCAG 2.1 AA automatizada sem violações |
| Migração atual | `0005`; executar `alembic upgrade head` antes de iniciar a nova versão |

## O que depende da instituição

- Chaves VAPID e contato de privacidade cadastrados na hospedagem.
- Servidor ClamAV (exige plano com memória suficiente) antes de dados reais.
- Registro no Entra, Object ID do administrador e política MFA.
- Deploy desta versão, migração `0005` e ensaio de restauração no banco hospedado.
- Confirmação da regra oficial de frequência e do texto de privacidade.
- Contas de loja (Google/Apple) e conta Expo, se for publicar app nativo.
- Pentest do ambiente publicado e testes com usuários e leitores de tela.

A existência de código em uma branch não atualiza a `main` nem os serviços da
nuvem automaticamente. Produção permanece bloqueada até o aceite institucional.

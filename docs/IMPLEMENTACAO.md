# Estado da implementação — 09/09/2026

Consulte [o relatório de revisão](RELATORIO-REVISAO.md) para achados, validação,
limitações e informações que o responsável precisa fornecer.

| Entrega | Estado do código |
| --- | --- |
| Fundação | API FastAPI, cadastros, vínculos, sessões, auditoria e backup SQLite |
| Painel | Interface web conectada, navegação e permissões por perfil |
| Homologação | Entradas Vercel/FastAPI, bloqueio de produção, proteção do ambiente |
| Microsoft/admin | OIDC single tenant com PKCE, MFA administrativo, identidades e sessões |
| Fluxos acadêmicos | Publicações, entregas, avaliações, eventos, grade, anexos `.txt` e lote |
| Migração atual | `0003`; executar `alembic upgrade head` antes de iniciar a nova versão |

As entregas anteriores estão em PRs encadeados. A branch de revisão contém esse
histórico e as novas alterações; a existência de código em uma branch não atualiza
a `main` nem o serviço da nuvem automaticamente.

## Pendências de desenvolvimento

- Aplicativo Expo Android/iOS, navegação móvel, estados offline e validação em dispositivos.
- Calendário consolidado, agendamento automático de publicações e notificações push
  com preferências, retentativas e deduplicação.
- Anexos PDF/Office com armazenamento privado, verificação de malware e política de retenção.
- Chamada/frequência, após confirmar o diário oficial e a regra de cálculo com a coordenação.
- Administração operacional adicional: recuperação supervisionada, alertas,
  revogação individual de sessão e configurações editáveis autorizadas.
- Acessibilidade e QA visual completos; a sintaxe JavaScript não substitui essas verificações.

## Pendências de ativação

Registro no Entra, Object ID do administrador, política MFA, PostgreSQL isolado,
segredos na hospedagem, migrações, URL de homologação e teste de restauração do
banco hospedado. Não há conta real provisionada nem deploy realizado nesta execução.

## Aceite de segurança

Testes locais de regressão e revisão estática são parte da entrega. Pentest da
nuvem está expressamente adiado até a confirmação do usuário e a definição do
alvo autorizado. Produção permanece bloqueada até o aceite institucional e operacional.

# Hub Acadêmico — Fatec Adamantina

Hub acadêmico em Python/FastAPI com painel web para alunos, professores, coordenação e administrador. O aplicativo Expo faz parte do roteiro e ainda não foi implementado.

## Estado atual

O projeto contém os protótipos originais, o backend e um **painel acadêmico
conectado à API**, disponível em `/panel/` no mesmo servidor. O app Expo ainda
não foi implementado. Esta versão serve ao desenvolvimento local com dados
fictícios; a liberação para operação institucional continua bloqueada.

| Área | Implementação nesta versão |
| --- | --- |
| API | FastAPI, rotas `/api/v1`, contrato OpenAPI em `/docs` |
| Banco | SQLAlchemy, migração Alembic; SQLite local e driver PostgreSQL |
| Acesso local | Contas provisionadas, senhas Argon2, sessões opacas com expiração e logout |
| Coordenação | Criar usuários; criar/editar cursos, disciplinas e ofertas de turma |
| Vínculos | Matrícula de aluno e atribuição de professor com vigência explícita |
| Permissões | Aluno/professor só consulta turma com vínculo ativo; gestão restrita à coordenação |
| Histórico | Auditoria transacional e arquivamento/restauração de cadastros |
| Recuperação local | Backup SQLite e restauração em novo arquivo com verificação |
| Painel web | Visão geral, cadastros, vínculos, arquivamento e auditoria; paginação e seletores com busca |
| Sessão web | Cookie HttpOnly/SameSite/Secure por padrão, validação de origem e CSRF |
| Desenvolvedor/admin | Console de usuários, identidades, permissões, bloqueios e sessões; MFA/contexto Entra exigido |
| Microsoft institucional | Fluxo OIDC implementado; ativação depende do registro e configuração no tenant da Fatec |
| Design | Referências originais preservadas em `design/` e `fatec-adamantina-app/` |

Veja [como executar o backend](backend/README.md) e o
[roteiro de implementação](docs/IMPLEMENTACAO.md).

## Fontes do produto

- `PRODUCT.md`: requisitos e decisões do produto.
- `design/README.md`: identidade visual e referências de aluno, professor e coordenação.
- `fatec-adamantina-app/README.md`: instruções do bundle original de design.
- `docs/auditoria.html`: diagnóstico histórico do protótipo em 05/09/2026.
  Suas referências a “nenhum repositório”, “nenhuma tela de professor/coordenação”
  e “nenhum backend” já não descrevem o estado desta branch.

Os nomes e números dos protótipos são fictícios. O backend inicia vazio.

## Homologação na nuvem

Configuração Vercel/FastAPI e modo de teste protegido na branch `feat/cloud-staging`.
Veja o [roteiro de homologação](docs/HOMOLOGACAO-VERCEL.md), incluindo a correção
do erro `vite: command not found`, banco separado e variáveis obrigatórias.
A preparação não significa que houve deploy nem libera produção.

## Microsoft e administrador

Veja [como ativar o login e provisionar o primeiro administrador](docs/MICROSOFT-ADMIN.md).
Execute `alembic upgrade head`: a migração atual é `0003` (fluxos acadêmicos). A `0002` encerra sessões antigas e preserva cadastros.
A autenticação real e a validação no navegador ainda dependem da configuração institucional.

## Fluxos acadêmicos desta branch

- Atividades, materiais, avisos e eventos: público explícito, rascunho, publicação,
  edição com controle de versão, busca e arquivamento/restauração.
- Entregas privadas, prazo pelo servidor, avaliação e feedback. A média do hub não
  representa boletim oficial.
- Eventos: inscrição, cancelamento e vagas verificadas no PostgreSQL.
- Grade: vigência, sala, turma e conflito de professor considerando os vínculos.
- Matrículas em lote: até 100 e-mails, prévia e aplicação transacional.
- Anexos privados limitados a texto UTF-8 `.txt`, 512 KiB e 10 arquivos por registro.

Consulte o [relatório de revisão e pendências](docs/RELATORIO-REVISAO.md) e o
[mapa das pastas](docs/ESTRUTURA.md). O pentest remoto aguarda a confirmação do
responsável de que a homologação está publicada.

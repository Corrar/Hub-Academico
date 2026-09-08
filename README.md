# Hub Acadêmico — Fatec Adamantina

App de aluno/professor em Expo e painel web da coordenação, com uma API compartilhada.

## Estado atual

O projeto contém os protótipos originais e a primeira implementação do backend.
**Ainda não há app Expo ou painel web conectado à API.** O backend v0.1 é para
desenvolvimento local com dados fictícios, não para operação institucional.

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
| Interfaces | Referências visuais em `design/` e `fatec-adamantina-app/` |

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

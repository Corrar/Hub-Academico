# Estrutura do repositório

A branch de revisão se chama `melhoria/revisao-e-fluxos-academicos` (pt-BR, sem
acentos para facilitar o uso no Git e na hospedagem).

| Caminho | Responsabilidade |
| --- | --- |
| `README.md` | Ponto de entrada, escopo implementado e instruções |
| `PRODUCT.md` | Requisitos, decisões e limites institucionais |
| `index.py`, `vercel.json`, `requirements.txt` | Entrada de homologação com raiz na pasta do repositório |
| `backend/index.py`, `backend/vercel.json` | Entrada alternativa com raiz em `backend/` |
| `backend/app/main.py` | Composição da aplicação, sessão web, cadastros e dependências de autorização |
| `backend/app/security.py`, `microsoft.py`, `admin.py` | Autenticação, OIDC e ações administrativas auditadas |
| `backend/app/academic/schemas.py` | Contratos de atividades, entregas, avaliações e grade |
| `backend/app/academic/routes.py` | Rotas acadêmicas e autorização por turma/aluno |
| `backend/app/academic/scheduling.py` | Regras de conflito e serialização da grade |
| `backend/app/academic/enrollment.py` | Prévia e aplicação de matrículas em lote |
| `backend/app/models.py`, `db.py` | Modelo relacional e conexão |
| `backend/app/staging.py` | Configuração que bloqueia homologação incompleta |
| `backend/app/cli.py`, `bootstrap_admin.py` | Operações locais explícitas; sem bootstrap público |
| `backend/app/static/panel.js` | Sessão, navegação e cadastros comuns |
| `backend/app/static/admin.js` | Interface administrativa, extraída do painel comum |
| `backend/app/static/academic.js` | Publicações, entregas, notas, eventos, grade e lote |
| `backend/app/static/index.html`, `panel.css` | Estrutura e estilo compartilhados |
| `backend/migrations/versions/` | Migrações históricas congeladas; versão atual `0003` |
| `backend/tests/` | Regressões de API, sessão, identidade, dados e fluxos acadêmicos |
| `.github/workflows/backend.yml` | Verificação em SQLite e PostgreSQL |
| `docs/` | Operação, revisão e roteiro |
| `design/`, `fatec-adamantina-app/` | Referências visuais; não são o aplicativo executável |

As duas entradas Vercel existem para as duas escolhas de Root Directory e têm
regressões específicas. Não remova uma como suposta duplicata. Os arquivos de
design e o relatório HTML histórico não são servidos pelo painel nem entram no
bundle de homologação. Os logotipos foram preservados.

Novas regras acadêmicas ficam em `academic/`; interfaces por domínio ficam em
arquivos próprios. Migrações publicadas não devem importar modelos atuais nem
ser reescritas. Alterações futuras de esquema exigem nova revisão Alembic.

# Hub Acadêmico — memória do projeto

Hub acadêmico da Fatec Adamantina: API FastAPI e painel/PWA para alunos,
professores, coordenação e administrador. Visão geral em `README.md`; diagnóstico,
decisões e histórico em `docs/RELATORIO-ANALISE-2026-10.md`.

## Como trabalhar aqui

- Converse em português. O responsável (GitHub `Corrar`) costuma pedir ajustes
  enviando capturas do celular.
- Desenvolva e envie no branch `claude/ecstatic-tesla-clkdqb`. Não abra PR sem
  pedido explícito.
- Nunca grave segredos no Git (chave VAPID privada, URL de banco com senha,
  senhas pessoais) nem peça esses dados na conversa; eles ficam nas variáveis
  da hospedagem.
- `hub-academico.vercel.app` publica o `main`, que ainda não tem as mudanças
  deste branch. Cada push gera uma pré-visualização na Vercel (projeto
  `hub-academico`, time `corrars-projects`).

## Arquitetura

- Backend em `backend/`: FastAPI, SQLAlchemy, Alembic (revisão `0005`, igual a
  `SCHEMA_REVISION` em `app/db.py`). SQLite local; PostgreSQL 16 em produção.
- Painel em JavaScript puro, sem build, em `backend/app/static/`. Ordem de
  carga: `panel.js`, `admin.js`, `academic.js`, `attendance.js`, `device.js`,
  `experience.js`. `node scripts/sync-frontend.mjs` copia para `frontend/`
  (Vercel); o CI exige `--check`.
- Arquivos estáticos são servidos por lista fixa (`/panel/assets/{filename}` em
  `app/main.py` e a lista de `scripts/sync-frontend.mjs`): arquivo novo entra
  nas duas.
- CSP estrita: nada de `style=` em HTML ou SVG nem estilos inline. Use classes
  ou CSSOM (`element.style.width`, `style.setProperty("--value", …)`).

## Verificação antes de cada push

```bash
cd backend && python -m pytest -q && ruff check . && ruff format --check .
TEST_DATABASE_URL=postgresql+psycopg://… python -m pytest -q   # quando houver PostgreSQL
cd .. && npx prettier@3.3.3 --check "backend/app/static/*.{js,css,html}" "frontend-tests/*.mjs"
node scripts/sync-frontend.mjs --check && npm test --prefix frontend-tests
```

Mudanças de interface: rodar também os roteiros de `scripts/qa/` (e2e, axe,
PWA, capturas) e olhar as capturas. Meta: zero violações axe WCAG 2.1 AA.

## Identidade visual e padrões de UI

- Plus Jakarta Sans; vermelho `#E11D2A`/`#C8102E` no aluno; slate `#2E4756` no
  professor e na coordenação; tinta `#14181B`; fundo `#F4F5F7`. Tokens
  `--radius*`, `--shadow*` e `--ease` em `panel.css`.
- Helpers do painel: `when`, `deadline`/`deadlineChip` (datas relativas),
  `groupParts` (disciplina · turma · semestre), `pageAction` (ação principal no
  cabeçalho), `segmented`, `searchField`, `archivedToggle`, `status` (aviso
  flutuante), `dateBlock`/`dayBlock`, `learningDialog` (campos, caixas de
  seleção ao lado do texto, botões fixos no rodapé), `rollRow` (histórico de
  chamadas).
- Nunca esmaecer texto com `opacity`; manter contraste ≥ 4,5:1.
- Introdução: ilustrações do unDraw (`onb1.png` a `onb3.png`) na cor `#E11D2A`;
  origem e licença em `design/README.md`.

## Ambiente na nuvem

- A rede alcança só npm e PyPI; sites externos (unDraw, Storyset, Google) são
  bloqueados. Pesquisa na web pela ferramenta de busca.
- Chromium em `/opt/pw-browsers/chromium-1194`; Playwright Python 1.64 via pip.
- PostgreSQL 16 em `/usr/lib/postgresql/16`, com base de teste a criar a cada
  sessão.

## Estado em 16/10/2026

Concluído e com CI verde, último commit `3e8c5af`:

- Análise e funcionalidades: chamada, frequência, entregas, anexos, lembretes,
  push (Web Push/VAPID e Expo), PWA, ClamAV, LGPD, backup PostgreSQL e CSV.
- Redesenho de UI/UX: datas relativas, agenda semanal, grade da coordenação,
  auditoria legível, cartões com ação contextual, login dividido no computador.
- Segunda rodada: histórico de chamadas por mês, frequência com indicador
  circular, formulários com títulos por entidade e botões fixos.
- Introdução com novas ilustrações e telas organizadas; campos de login com
  foco no campo inteiro e nova tentativa automática de conexão.

Próximos passos possíveis (confirmar com o responsável):

1. Abrir PR para o `main` quando ele pedir, para atualizar a produção na Vercel.
2. Ideias de UI ainda não feitas: modo escuro; painel da coordenação com
   indicadores; menos ações repetidas nos cartões do professor ("Arquivar" em
   cada cartão); cadastros de cursos e disciplinas mais visuais; sugestões na
   busca.
3. Pendências externas em `docs/RELATORIO-ANALISE-2026-10.md`, seção
   "O que depende de terceiros".

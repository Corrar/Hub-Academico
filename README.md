# Hub Acadêmico — Fatec Adamantina

Hub acadêmico em Python/FastAPI com aplicativo web instalável (PWA) para alunos,
professores, coordenação e administrador. Funciona no navegador e instalado no
Android, iOS e computador, com notificações push. O backend já aceita o futuro app Expo.

## Estado atual

O backend e o **painel acadêmico conectado à API** (em `/panel/` no mesmo
servidor ou em `frontend/` na Vercel) cobrem os fluxos do produto para os três
perfis. Esta versão serve à homologação com dados fictícios; a liberação para
operação institucional continua bloqueada até as configurações e aceites
descritos em [o que depende de terceiros](docs/RELATORIO-ANALISE-2026-10.md#o-que-depende-de-terceiros).

| Área | Implementação |
| --- | --- |
| API | FastAPI, rotas `/api/v1`, contrato OpenAPI em `/docs` (fora da homologação) |
| Banco | SQLAlchemy e Alembic (revisão `0005`); SQLite local e PostgreSQL com backup e restauração verificada |
| Acesso | Contas provisionadas, Argon2, sessões opacas com 30 min de inatividade e 8 h no máximo, troca e redefinição de senha |
| Estrutura | Cursos, disciplinas, turmas, usuários, vínculos com vigência, matrícula em lote, busca e filtros |
| Grade | Horários com vigência, sala e verificação de conflito de turma, sala e professor |
| Chamada e frequência | Chamada pelo professor, correção auditada, frequência por disciplina com saldo de faltas |
| Atividades | Rascunho, envio, desfazer no prazo, situação nos cartões, resumo de entregas, fila de avaliação e devolutiva |
| Materiais e anexos | PDF, Office, imagens, CSV, notebooks e texto, com verificação de assinatura e download seguro |
| Avisos e eventos | Público obrigatório, alcance antes de publicar, agendamento, saída do ar, inscrições e lista de inscritos |
| Lembretes e push | Novidades e notas com não lidos; Web Push com preferências, fila, retentativas e lembrete de prazo |
| App instalável | Manifesto, ícones e service worker; abre sem conexão |
| Antivírus | Verificação ClamAV dos anexos, ativada por configuração |
| Privacidade (LGPD) | Cópia dos dados do titular, aviso de privacidade e retenção automática |
| Diário oficial | Exportação CSV de frequência e notas por turma |
| Interface | Datas relativas, agenda semanal, grade da coordenação, cartões com ação contextual, avisos flutuantes e login dividido no computador |
| Acessibilidade | Auditoria WCAG 2.1 AA sem violações nas telas dos três perfis |
| Coordenação | Visão geral com alertas (turma sem professor ou grade, vínculos a vencer) e auditoria |
| Permissões | Toda leitura e escrita valida papel e vínculo no servidor |
| Histórico | Auditoria imutável, arquivamento e restauração em vez de exclusão |
| Desenvolvedor/admin | Usuários, identidades, permissões, bloqueios e sessões (individual ou todas); MFA Entra exigido |
| Microsoft institucional | OIDC implementado; ativação depende do tenant da Fatec |
| Homologação | Entradas Vercel/Render, proteção do ambiente, `seed-demo` com dados fictícios |

Veja o [relatório de análise de outubro/2026](docs/RELATORIO-ANALISE-2026-10.md)
para o diagnóstico, o que foi implementado, as decisões tomadas e a verificação, e o
[guia de operação](docs/OPERACAO.md) para push, antivírus, backups e privacidade.

## Executar localmente

Instruções completas em [backend/README.md](backend/README.md). Resumo, na pasta
`backend` com Python 3.12:

```bash
python -m pip install -r requirements-dev.lock
cp .env.example .env
alembic upgrade head
python -m app.cli bootstrap --email coordenacao.dev@fatec.sp.gov.br --name "Coordenação de teste"
python -m app.cli seed-demo        # opcional: base fictícia para explorar todos os fluxos
uvicorn app.main:create_app --factory --reload --host 127.0.0.1
```

Acesse `http://127.0.0.1:8000/panel/`.

## Fontes do produto

- `PRODUCT.md`: requisitos e decisões do produto.
- `design/README.md`: identidade visual e referências de aluno, professor e coordenação.
- `fatec-adamantina-app/README.md`: instruções do bundle original de design.
- `docs/README.md`: índice de relatórios, roteiros e estrutura do repositório.

Os nomes e números dos protótipos e do `seed-demo` são fictícios. O backend inicia vazio.

## Homologação na nuvem

Na arquitetura separada recomendada, o backend FastAPI roda no Render e o painel
em `frontend/` roda na Vercel com Root Directory `frontend`; o proxy server-side
mantém a senha da proteção fora do navegador. Veja o
[roteiro de homologação](docs/HOMOLOGACAO-VERCEL.md) e o
[guia do frontend](frontend/README.md). Execute `alembic upgrade head` antes de
iniciar esta versão (revisão `0005`).

## Microsoft e administrador

Veja [como ativar o login e provisionar o primeiro administrador](docs/MICROSOFT-ADMIN.md).
Com Microsoft configurado, o login local, a troca de senha local e o `seed-demo`
ficam desativados.

## Testes

```bash
cd backend && python -m pytest -q && ruff check . && ruff format --check . && alembic check
npm ci --prefix frontend-tests && npm test --prefix frontend-tests
node scripts/sync-frontend.mjs --check
```

O workflow `.github/workflows/backend.yml` executa as mesmas verificações em
SQLite e PostgreSQL.

# Roteiros de QA no navegador

Roteiros locais em Playwright (Python) que exercitam o painel contra uma base
fictícia. Não rodam no CI; servem para validar mudanças de interface antes do push.

| Roteiro | O que verifica |
| --- | --- |
| `reset-server.sh` | Recria a base SQLite com `seed-demo` e inicia a API em `127.0.0.1:8000` |
| `e2e.py` | Fluxos dos quatro perfis: entrega com anexo, desfazer, inscrição, senha, avaliação em fila, chamada (arquivar e restaurar), aviso agendado e manutenção de usuário |
| `a11y.py` | axe-core WCAG 2.1 A/AA no login, na introdução e nas telas e diálogos dos três perfis |
| `pwa.py` | Service worker, manifesto, ícones, notificação exibida e abertura sem conexão |
| `tour.py` | Capturas de todas as telas para revisão visual (`tour.py PASTA [perfis]`) |

## Preparação

```bash
python -m pip install -r backend/requirements-dev.lock playwright
npm install --prefix /tmp/axe axe-core@4.10.2   # só para a11y.py
```

Variáveis:

| Variável | Uso |
| --- | --- |
| `QA_PASSWORD` | Senha das contas fictícias (12+ caracteres); nunca uma senha real |
| `QA_CHROME` | Caminho do Chromium, se o Playwright não baixar o seu (ex.: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`) |
| `QA_AXE` | Caminho do `axe.min.js` (ex.: `/tmp/axe/node_modules/axe-core/axe.min.js`) |
| `QA_OUT` | Pasta das capturas (padrão `qa-output`) |
| `QA_DIR`, `PYTHON` | Pasta da base de QA (padrão `/tmp/hub-qa`) e interpretador do `reset-server.sh` |

## Uso

```bash
export QA_PASSWORD='uma-senha-de-teste-local'
scripts/qa/reset-server.sh && python scripts/qa/e2e.py
scripts/qa/reset-server.sh && python scripts/qa/a11y.py
scripts/qa/reset-server.sh && python scripts/qa/pwa.py
scripts/qa/reset-server.sh && python scripts/qa/tour.py qa-output/telas
kill "$(cat /tmp/hub-qa/server.pid)"
```

Rode `reset-server.sh` antes de cada roteiro: eles alteram a base (entregas,
senhas, chamadas). As chaves VAPID de teste ficam em `$QA_DIR/vapid.env`, fora
do repositório.

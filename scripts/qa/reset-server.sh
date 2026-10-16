#!/usr/bin/env bash
# Recria a base local de QA com dados fictícios e (re)inicia a API em 127.0.0.1:8000.
set -euo pipefail
: "${QA_PASSWORD:?Defina QA_PASSWORD (12+ caracteres) para as contas fictícias}"
QA_DIR=${QA_DIR:-/tmp/hub-qa}
PYTHON=${PYTHON:-python}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
mkdir -p "$QA_DIR"
cd "$ROOT/backend"
export DATABASE_URL="sqlite:///$QA_DIR/hub.db" WEB_SECURE_COOKIE=false APP_ENV=development \
  HUB_DEMO_PASSWORD="$QA_PASSWORD" VAPID_SUBJECT=mailto:suporte@fatec.sp.gov.br \
  PUSH_DISPATCH_INTERVAL_SECONDS=15
# Chaves VAPID só de teste, geradas uma vez e mantidas fora do repositório.
if [ ! -f "$QA_DIR/vapid.env" ]; then
  "$PYTHON" -m app.cli vapid-keys | grep '^VAPID_' >"$QA_DIR/vapid.env"
  chmod 600 "$QA_DIR/vapid.env"
fi
set -a
. "$QA_DIR/vapid.env"
set +a
if [ -f "$QA_DIR/server.pid" ]; then
  kill "$(cat "$QA_DIR/server.pid")" 2>/dev/null || true
  sleep 1
fi
rm -f "$QA_DIR/hub.db"
"$PYTHON" -m alembic upgrade head >/dev/null
"$PYTHON" -c "import os; from app.cli import bootstrap; bootstrap('coordenacao.dev@fatec.sp.gov.br', 'Carla Souza', os.environ['HUB_DEMO_PASSWORD'])"
"$PYTHON" -m app.cli seed-demo --password-env HUB_DEMO_PASSWORD
nohup "$PYTHON" -m uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8000 \
  >"$QA_DIR/server.log" 2>&1 &
echo $! >"$QA_DIR/server.pid"
sleep 3
curl -s 127.0.0.1:8000/health/ready
echo

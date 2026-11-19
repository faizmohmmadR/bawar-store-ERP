#!/usr/bin/env bash
# Nightly maintenance for Hostinger / shared hosting.
# Runs: auto backup + prune old backups + purge old activity logs + purge trash
#
# Hostinger cron example (once per day at 02:00 server time):
#   0 2 * * * /home/USER/domains/YOURDOMAIN/public_html/scripts/hostinger_cron.sh
#
# Or use HTTP cron instead (see docs/hostinger-maintenance.md).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${PROJECT_DIR}/backups"
LOG_FILE="${LOG_DIR}/maintenance.log"
PYTHON_BIN="${PYTHON_BIN:-}"

cd "${PROJECT_DIR}"
mkdir -p "${LOG_DIR}"

if [[ -z "${PYTHON_BIN}" ]]; then
  if [[ -x "${PROJECT_DIR}/venv/bin/python" ]]; then
    PYTHON_BIN="${PROJECT_DIR}/venv/bin/python"
  elif [[ -x "${PROJECT_DIR}/.venv/bin/python" ]]; then
    PYTHON_BIN="${PROJECT_DIR}/.venv/bin/python"
  else
    PYTHON_BIN="$(command -v python3 || command -v python)"
  fi
fi

{
  echo "==== $(date -Is) maintenance start ===="
  "${PYTHON_BIN}" manage.py run_maintenance
  echo "==== $(date -Is) maintenance done ===="
} >> "${LOG_FILE}" 2>&1

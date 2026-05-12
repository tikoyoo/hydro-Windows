#!/usr/bin/env bash
#
# 在「已 clone hydro-Windows 仓库」的服务器上，于仓库根目录执行（默认插件路径 /root/hydrooj-plugin-api）：
#   bash scripts/install-hydro-plugin-sync-bootstrap.sh
#
# 可选环境变量：
#   PLUGIN_ROOT=/root/hydrooj-plugin-api
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLUGIN_ROOT="${PLUGIN_ROOT:-/root/hydrooj-plugin-api}"
SNIPPET="${REPO_ROOT}/plugin/snippets/syncBootstrap.ts"
HANDLER_DST="${PLUGIN_ROOT}/src/handlers/syncBootstrap.ts"
INDEX_TS="${PLUGIN_ROOT}/src/index.ts"

if [[ ! -f "$SNIPPET" ]]; then
  echo "找不到片段文件: $SNIPPET（请在 hydro-Windows 仓库根下执行，或设置 REPO_ROOT）" >&2
  exit 1
fi

if [[ ! -d "$PLUGIN_ROOT/src/handlers" ]]; then
  echo "找不到插件目录: ${PLUGIN_ROOT}/src/handlers" >&2
  exit 1
fi

echo "==> 复制 handler: $SNIPPET -> $HANDLER_DST"
install -m 0644 "$SNIPPET" "$HANDLER_DST"

if [[ ! -f "$INDEX_TS" ]]; then
  echo "找不到: $INDEX_TS" >&2
  exit 1
fi

echo "==> 修补 index.ts（迁移错误路径 import / Route）"
export INDEX_TS
python3 <<'PY'
from pathlib import Path
import os

p = Path(os.environ["INDEX_TS"])
text = p.read_text(encoding="utf-8")
orig = text
changed = False

def migrate_wrong_paths():
    """旧版使用 /api/sync/health — Hydro 已占 /api/:op（单段），多段路径进不了插件 Route。"""
    global text, changed
    reps = (
        ("'/api/sync/health'", "'/extras/sync/health'"),
        ('"/api/sync/health"', "'/extras/sync/health'"),
        ("'/api/sync/bootstrap'", "'/extras/sync/bootstrap'"),
        ('"/api/sync/bootstrap"', "'/extras/sync/bootstrap'"),
    )
    for a, b in reps:
        if a in text:
            text = text.replace(a, b)
            changed = True
            print("migrate: %s -> %s" % (a, b))


def ensure_import():
    global text, changed
    if "./handlers/syncBootstrap'" in text or 'handlers/syncBootstrap' in text:
        return
    a = "import { DomainUserStatsHandler } from './handlers/domainUser';"
    b = (
        a
        + "\nimport { SyncHealthHandler, SyncBootstrapHandler } from './handlers/syncBootstrap';"
    )
    if a not in text:
        raise SystemExit("未找到 import DomainUserStatsHandler 锚点，请手工合并 index.ts")
    text = text.replace(a, b, 1)
    changed = True


def ctx_route_mark(name):
    return "ctx.Route('%s'" % name


def ensure_routes():
    global text, changed
    if ctx_route_mark("sync_health") in text:
        return
    u = (
        "  ctx.Route('api_domain_users', '/api/domainUsers', DomainUserStatsHandler);\n\n"
        "  // 添加 CORS 支持"
    )
    v = (
        "  ctx.Route('api_domain_users', '/api/domainUsers', DomainUserStatsHandler);\n\n"
        "  ctx.Route('sync_health', '/extras/sync/health', SyncHealthHandler);\n"
        "  ctx.Route('sync_bootstrap', '/extras/sync/bootstrap', SyncBootstrapHandler);\n\n"
        "  // 添加 CORS 支持"
    )
    if u not in text:
        raise SystemExit("未找到 api_domain_users / CORS 锚点（ctx.Route），请手工合并 index.ts")
    text = text.replace(u, v, 1)
    changed = True


migrate_wrong_paths()
ensure_import()

if ctx_route_mark("sync_health") not in text:
    ensure_routes()
else:
    print("ctx.Route(sync_*) 已存在")

if "/extras/sync/health" not in text:
    raise SystemExit("index.ts 中仍无 /extras/sync/health，请手动检查 Route 段落")

if text != orig:
    p.write_text(text, encoding="utf-8")
    print("index.ts 已保存")
else:
    print("index.ts 未改动（已达预期路径）")
PY

echo "==> pm2 restart hydrooj（若进程名不同，请改脚本末尾）"
pm2 restart hydrooj

echo ""
echo "完成。匿名自检：curl -sS -H 'Accept: application/json' 'https://<主站>/extras/sync/health'"
echo '期望 JSON 中含 "ok":true（extras 不走 /api/:op）。'

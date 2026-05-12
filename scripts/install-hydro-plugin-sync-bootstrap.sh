#!/usr/bin/env bash
#
# 在「已 clone hydro-Windows 仓库」的服务器上，于仓库根目录执行（需 root，默认插件路径 /root/hydrooj-plugin-api）：
#   sudo bash scripts/install-hydro-plugin-sync-bootstrap.sh
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

echo "==> 幂等修补 index.ts（import / Route / apiRoutes 分步修补，避免因「路由已有」跳过 apiRoutes 白名单）"
export INDEX_TS
python3 <<'PY'
from pathlib import Path
import os

p = Path(os.environ["INDEX_TS"])
text = p.read_text(encoding="utf-8")
orig = text
changed = False

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
        "  ctx.Route('sync_health', '/api/sync/health', SyncHealthHandler);\n"
        "  ctx.Route('sync_bootstrap', '/api/sync/bootstrap', SyncBootstrapHandler);\n\n"
        "  // 添加 CORS 支持"
    )
    if u not in text:
        raise SystemExit("未找到 api_domain_users / CORS 锚点（ctx.Route），请手工合并 index.ts")
    text = text.replace(u, v, 1)
    changed = True


def ensure_api_routes():
    global text, changed
    key = "const apiRoutes"
    if key not in text:
        print(
            "警告：未找到 const apiRoutes — 若为旧版插件，请手写将 sync_health/sync_bootstrap 加入匿名 JSON API 白名单（与 Hydro 源码中 /api JSON 门禁一致）",
        )
        return

    i0 = text.index(key)
    lb = text.index("[", i0)
    depth = 0
    close_idx = None
    k = lb
    while k < len(text):
        c = text[k]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                close_idx = k
                break
        k += 1
    if close_idx is None:
        raise SystemExit("const apiRoutes 数组未闭合，请检查 index.ts")

    inner = text[lb + 1 : close_idx]

    def qs(tok):
        return ("'%s'" % tok) in inner or ('"%s"' % tok) in inner

    # Hydro 外层 JSON 门禁可能按 ctx.Route 名（sync_health），也可能按 Handler 推导名（SyncHealth）。
    TOKENS = ("sync_health", "sync_bootstrap", "SyncHealth", "SyncBootstrap")
    if all(qs(t) for t in TOKENS):
        print("apiRoutes 已含 sync 相关条目（蛇形 + Pascal）")
        return

    missing = [t for t in TOKENS if not qs(t)]
    addition = ""
    for t in missing:
        addition += "    '%s',\n" % t

    text = text[:close_idx] + addition + text[close_idx:]
    changed = True
    print("已补充 apiRoutes 白名单条目: %s" % ", ".join(missing))


ensure_import()

if ctx_route_mark("sync_health") not in text:
    ensure_routes()
else:
    print("ctx.Route(sync_*) 已存在，跳过 Route 段落修补")

ensure_api_routes()

if text != orig:
    p.write_text(text, encoding="utf-8")
    print("index.ts 已保存")
else:
    print("index.ts 未改动（或与预期一致无需保存）")
PY

echo "==> pm2 restart hydrooj（若进程名不同，请改脚本末尾）"
pm2 restart hydrooj

echo ""
echo "完成。匿名自检：curl -sS -H 'Accept: application/json' 'https://<主站>/api/sync/health' 期望含 \"ok\":true。"

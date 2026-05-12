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

# Hydro addon 加载器只找根目录 index.ts / index.js，不看 package.json 的 main。
# 若插件入口在 src/index.ts，必须在根目录创建 index.ts 重导出 apply。
ROOT_INDEX="${PLUGIN_ROOT}/index.ts"
if [[ ! -f "$ROOT_INDEX" ]]; then
  echo "==> 创建根 index.ts（重导出 src/index.ts 的 apply）"
  echo 'export { apply } from "./src/index";' > "$ROOT_INDEX"
elif ! grep -q 'from.*src/index' "$ROOT_INDEX" 2>/dev/null; then
  echo "==> 根 index.ts 存在但未重导出 src/index，追加 export"
  echo 'export { apply } from "./src/index";' >> "$ROOT_INDEX"
fi

if [[ ! -f "$INDEX_TS" ]]; then
  echo "找不到: $INDEX_TS" >&2
  exit 1
fi

echo "==> 修补 index.ts（迁移 Route → /edu-sync-*）"
export INDEX_TS
python3 <<'PY'
from pathlib import Path
import os

p = Path(os.environ["INDEX_TS"])
text = p.read_text(encoding="utf-8")
orig = text
changed = False

H = "'/edu-sync-health'"
B = "'/edu-sync-bootstrap'"


def migrate_all():
    global text, changed
    reps = (
        ("'/api/sync/health'", H),
        ('"/api/sync/health"', H),
        ("'/api/sync/bootstrap'", B),
        ('"/api/sync/bootstrap"', B),
        ("'/extras/sync/health'", H),
        ('"/extras/sync/health"', H),
        ("'/extras/sync/bootstrap'", B),
        ('"/extras/sync/bootstrap"', B),
    )
    for a, b in reps:
        if a in text:
            text = text.replace(a, b)
            changed = True
            print("migrate route path: %s -> %s" % (a, b))


def ensure_import():
    global text, changed
    if "SyncConnectionHandler" in text and "handlers/syncBootstrap" in text:
        return
    import re

    pat = re.compile(
        r"^(\s*)import\s*\{\s*SyncHealthHandler\s*,\s*SyncBootstrapHandler\s*\}\s*from\s*['\"]\./handlers/syncBootstrap['\"]\s*;",
        re.MULTILINE,
    )
    if pat.search(text):
        text = pat.sub(
            r"\1import { SyncHealthHandler, SyncBootstrapHandler, SyncConnectionHandler } from './handlers/syncBootstrap';",
            text,
            count=1,
        )
        changed = True
        print("updated import: added SyncConnectionHandler (regex)")
        return
    # 旧版精确字符串
    old_import = "import { SyncHealthHandler, SyncBootstrapHandler } from './handlers/syncBootstrap';"
    new_import = "import { SyncHealthHandler, SyncBootstrapHandler, SyncConnectionHandler } from './handlers/syncBootstrap';"
    if old_import in text:
        text = text.replace(old_import, new_import, 1)
        changed = True
        print("updated import: added SyncConnectionHandler")
        return
    # 全新插入
    a = "import { DomainUserStatsHandler } from './handlers/domainUser';"
    b = (
        a
        + "\nimport { SyncHealthHandler, SyncBootstrapHandler, SyncConnectionHandler } from './handlers/syncBootstrap';"
    )
    if a not in text:
        raise SystemExit("未找到 import DomainUserStatsHandler 锚点，请手工合并 index.ts")
    text = text.replace(a, b, 1)
    changed = True
    print("inserted import: SyncHealthHandler, SyncBootstrapHandler, SyncConnectionHandler")


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
        "  ctx.Route('sync_health', '/edu-sync-health', SyncHealthHandler);\n"
        "  ctx.Route('sync_bootstrap', '/edu-sync-bootstrap', SyncBootstrapHandler);\n\n"
        "  // 添加 CORS 支持"
    )
    if u not in text:
        raise SystemExit("未找到 api_domain_users / CORS 锚点（ctx.Route），请手工合并 index.ts")
    text = text.replace(u, v, 1)
    changed = True


def ensure_connection():
    global text, changed
    if "ctx.Connection('sync_conn'" in text or "ctx.Connection(\"sync_conn\"" in text:
        return
    import re

    conn_line = "  ctx.Connection('sync_conn', '/edu-sync-conn', SyncConnectionHandler);"
    pat = re.compile(
        r"^(\s*)ctx\.Route\(\s*['\"]sync_bootstrap['\"]\s*,\s*['\"]/edu-sync-bootstrap['\"]\s*,\s*SyncBootstrapHandler\s*\)\s*;",
        re.MULTILINE,
    )
    m = pat.search(text)
    if m:
        text = text[:m.end()] + "\n" + conn_line + text[m.end():]
        changed = True
        print("inserted ctx.Connection (regex)")
        return
    # 回退：整行匹配（应对空格/分号差异）
    lines = text.splitlines(keepends=True)
    out = []
    inserted = False
    for line in lines:
        out.append(line)
        if inserted:
            continue
        if (
            "ctx.Route" in line
            and "sync_bootstrap" in line
            and "edu-sync-bootstrap" in line
            and "SyncBootstrapHandler" in line
        ):
            indent = re.match(r"^(\s*)", line)
            ind = indent.group(1) if indent else "  "
            out.append(ind + "ctx.Connection('sync_conn', '/edu-sync-conn', SyncConnectionHandler);\n")
            inserted = True
            changed = True
            print("inserted ctx.Connection (line fallback)")
    if inserted:
        text = "".join(out)
    else:
        print("warning: 未找到 sync_bootstrap 的 ctx.Route，未插入 Connection，请检查 index.ts")


migrate_all()
ensure_import()

if ctx_route_mark("sync_health") not in text:
    ensure_routes()

ensure_connection()

if "/edu-sync-health" not in text:
    raise SystemExit("index.ts 仍未出现 /edu-sync-health，请检查 ctx.Route(sync_health, ...)")

if text != orig:
    p.write_text(text, encoding="utf-8")
    print("index.ts 已保存")
else:
    print("index.ts 已达目标路径（或未需改动）")
PY

echo "==> pm2 restart hydrooj（若进程名不同，请改脚本末尾）"
pm2 restart hydrooj

echo ""
echo "完成。匿名自检："
echo "  curl -sS -H 'Accept: application/json' 'http://127.0.0.1:8888/edu-sync-health'"
echo "  curl -sS -H 'Accept: application/json' 'https://<主站>/edu-sync-health'"
echo ""
echo '期望 JSON：{"ok":true,"service":"hydrooj-plugin-sync",...}'

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

echo "==> 幂等修补 index.ts"
export INDEX_TS
python3 <<PY
from pathlib import Path
import os
p = Path(os.environ["INDEX_TS"])
text = p.read_text(encoding="utf-8")
if "from './handlers/syncBootstrap'" in text and "sync_health" in text:
    print("index.ts 已包含 sync 路由，跳过")
else:
    a = "import { DomainUserStatsHandler } from './handlers/domainUser';"
    b = a + "\nimport { SyncHealthHandler, SyncBootstrapHandler } from './handlers/syncBootstrap';"
    if "syncBootstrap" not in text:
        if a not in text:
            raise SystemExit("未找到 domainUser import 锚点，请手工合并 index.ts")
        text = text.replace(a, b, 1)
    u = "  ctx.Route('api_domain_users', '/api/domainUsers', DomainUserStatsHandler);\n\n  // 添加 CORS 支持"
    v = "  ctx.Route('api_domain_users', '/api/domainUsers', DomainUserStatsHandler);\n\n  ctx.Route('sync_health', '/api/sync/health', SyncHealthHandler);\n  ctx.Route('sync_bootstrap', '/api/sync/bootstrap', SyncBootstrapHandler);\n\n  // 添加 CORS 支持"
    if "sync_health" not in text:
        if u not in text:
            raise SystemExit("未找到 api_domain_users / CORS 锚点，请手工合并 index.ts")
        text = text.replace(u, v, 1)
    x = "    'api_domain_users',\n  ];"
    y = "    'api_domain_users',\n    'sync_health',\n    'sync_bootstrap',\n  ];"
    if "'sync_health'" not in text.split("const apiRoutes", 1)[1].split("]", 1)[0]:
        if x not in text:
            raise SystemExit("未找到 apiRoutes 数组结尾锚点，请手工合并 index.ts")
        text = text.replace(x, y, 1)
    p.write_text(text, encoding="utf-8")
    print("index.ts 已更新")
PY

echo "==> pm2 restart hydrooj（若进程名不同，请改脚本末尾）"
pm2 restart hydrooj

echo ""
echo "完成。说明：Hydro 对 /api/* 常要求登录，匿名 curl /api/sync/health 可能仍返回 {\"url\":\"/login?...\"}，属预期。"
echo "可在浏览器已登录状态下访问同路径，或带 Cookie 的 curl 验证。"

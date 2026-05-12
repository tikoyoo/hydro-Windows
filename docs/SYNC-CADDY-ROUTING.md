# 同步协议 P0：路径与 Guest 权限（为何曾出现 `{"url":"/login"}`）

## 1. 不要用 `/api/sync/...`

Hydro 内核注册 **`GET /api/:op`**（`@hydrooj/framework` → `applyApiHandler`），**`:op` 只占一段**。  
**`/api/sync/health`** 为 **三段**路径，**匹配不到**你在插件里写的 Route，会落到其它逻辑。

## 2. 定稿路径（单段、少冲突）

- **`GET /edu-sync-health`** — 匿名（`SyncHealthHandler`）
- **`GET /edu-sync-bootstrap`** — 未登录返回 **401 JSON**，已登录返回版本（`SyncBootstrapHandler` 内判断 uid）

安装脚本与片段见 **`plugin/snippets/syncBootstrap.ts`**、**`scripts/install-hydro-plugin-sync-bootstrap.sh`**。

## 3. Guest 与 `noCheckPermView`

Hydro 在 **`handler/create/http`** 对 Guest 会执行 **`checkPerm(PERM_VIEW)`**（见 `hydrooj` 的 `service/server.ts`）。  
未通过会抛 **`PrivilegeError`**，Guest 时会被渲染成 **`{"url":"/login?..."}`**。

因此：

- **`SyncHealthHandler`**：除 class 字段外，在 **构造函数里再设 `this.noCheckPermView = true`**（部分 TS/运行链下更稳）。
- **`SyncBootstrapHandler`**：同样需要 **`noCheckPermView`**，否则 Guest **进不了 `get()`**，无法返回我们设计的 **401 JSON**；登录校验仍在 **`get()`** 里做。

## 4. Caddy

**`/edu-sync-*` 不在 `/api/*` 里**，一般走默认 **`reverse_proxy → 8888`**，**不必**再为旧 `/api/sync` 写 `@sync`。

## 5. 验证

```bash
curl -sS -H 'Accept: application/json' 'http://127.0.0.1:8888/edu-sync-health'
curl -sS -H 'Accept: application/json' 'https://你的域名/edu-sync-health'
```

期望：`{"ok":true,"service":"hydrooj-plugin-sync","serverTime":...}`

## 6. 服务器部署验证清单（P0，按顺序）

这些是 **`curl` 一直返回 `{"url":"/login?..."}`** 或 **`404`** 时最常见的原因；与 Caddy 关系不大。

| 步骤 | 做什么 | 期望 |
|------|--------|------|
| **1. `addon.json` 路径** | `sudo cat /root/.hydro/addon.json` | 列表里应有插件目录的 **绝对路径**，例如 **`"/root/hydrooj-plugin-api"`**。仅写包名 **`"hydrooj-plugin-api"`** 时，**`preload()`** 若能 resolve 到目录可装载版本号，但 **`addon()`** 仍依赖步骤 2；建议统一用 **绝对路径**，避免歧义。 |
| **2. 根目录 `index.ts`** | `sudo test -f /root/hydrooj-plugin-api/index.ts && sudo head -1 /root/hydrooj-plugin-api/index.ts` | Hydro **`entry/common.ts`** 的 addon 加载器只查找插件根目录 **`index.ts`** / **`index.js`**，**不读 `package.json` 的 `main`**。入口若在 **`src/index.ts`**，根目录必须有 **`export { apply } from "./src/index";`**（一行即可）。缺失时插件**静默不加载**，路由永远不会注册。 |
| **3. 安装脚本** | 在 **`/root/hydro-Windows`** 执行 **`bash scripts/install-hydro-plugin-sync-bootstrap.sh`** | 会复制 handler、修补 **`src/index.ts`**（含 **`ctx.Route`** 与 **`ctx.Connection('/edu-sync-conn')`**）、确保根 **`index.ts`**、**`pm2 restart hydrooj`**。 |
| **4. 日志确认已加载** | `sudo bash -lc 'export PATH=/usr/local/bin:$PATH; pm2 logs hydrooj --lines 120 --nostream \| grep -i hydrooj-plugin-api'` | 应出现 **`apply plugin … hydrooj-plugin-api/index.ts`**（或带 **`scope hydrooj-plugin-api`**）。**没有这一行说明插件仍未被加载**，先不要做前端联调。 |
| **5. 本机自检** | `curl -sS -H 'Accept: application/json' 'http://127.0.0.1:8888/edu-sync-health'` | JSON 含 **`"ok":true`**、**`"service":"hydrooj-plugin-sync"`**。 |
| **6. 域名自检** | `curl -sS -H 'Accept: application/json' 'https://你的域名/edu-sync-health'` | 同上（需 **443** 与 DNS 正常）。 |
| **7. Bootstrap（可选）** | 浏览器已登录态或 `curl` 带 Cookie：`/edu-sync-bootstrap` | 已登录：**`userDataVersion`**；未登录：**401** 与 **`error: login_required`**，而非整站登录 HTML。 |

**权限提示**：非 root 用户请对 **`/root`** 下路径使用 **`sudo`**，**`pm2`** 在 **`sudo bash -lc 'export PATH=/usr/local/bin:$PATH; …'`** 中执行，避免 **`pm2: command not found`**。

## 7. P1：WebSocket `/edu-sync-conn`（部署与自检）

P1 在插件中注册 **`SyncConnectionHandler`**，路径 **`WS /edu-sync-conn`**（与 Hydro **`ctx.Connection`** 一致）。本地开发时 **hydroforwindows** 的 **`vite.config.js`** 将 **`/edu-sync-conn`** 以 **WebSocket** 反代到 `HYDRO_ORIGIN`（与 **`/api`** 等同源策略）。

| 步骤 | 做什么 | 期望 |
|------|--------|------|
| **1. 代码已合并** | **`src/index.ts`** 含 **`ctx.Connection('sync_conn', '/edu-sync-conn', SyncConnectionHandler)`**；**`handlers/syncBootstrap.ts`** 含 **`SyncConnectionHandler`**（**`@subscribe('record/change')`** 等）。 | 安装脚本应已幂等插入；若缺失可再跑一次 **`scripts/install-hydro-plugin-sync-bootstrap.sh`**。 |
| **2. Caddy** | 默认 **`reverse_proxy`** 对 **Upgrade: websocket** 会转发到上游，**一般无需单独写 `@sync`**；勿把 **`/edu-sync-conn`** 单独指到 **8890**，应与其它页面一样进 **8888**（Hydro）。 | 与 **`§4`** 一致。 |
| **3. 浏览器验证** | 打开已部署前端，**登录**后打开开发者工具 → **Network → WS**，应看到 **`/edu-sync-conn`** 为 **101** 或已连接；首条消息常为 **`type: sync/hello`**（含 **`userDataVersion`**）。 | 未登录时连接应被服务端关闭或收到 **`sync/error`**（**`login_required`**）。 |
| **4. 服务端推送** | 用户**产生评测记录**后，日志中若有 **`record/change`** 广播，对应 uid 的 WS 应收到 **`type: sync/version`**，**`userDataVersion`** 递增，**`resources`** 含 **`stats`** 等。 | 若从不推送：检查事件名是否与 Hydro 版本一致（见插件内 **`@subscribe`**）。 |
| **5. 回退** | 前端在 WS 多次重连失败后改为 **`pullSyncBootstrap` 轮询（30s）**，不阻塞页面。 | 仍应能间接感知版本变化。 |

**与 P0 关系**：先做 **§6** 确认插件已加载；再做本节，否则 WS 路由不存在。

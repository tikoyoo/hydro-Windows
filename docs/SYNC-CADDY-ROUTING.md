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
| **3. 安装脚本** | 在 **`/root/hydro-Windows`** 执行 **`bash scripts/install-hydro-plugin-sync-bootstrap.sh`** | 会复制 handler、修补 **`src/index.ts`**、确保根 **`index.ts`**、**`pm2 restart hydrooj`**。 |
| **4. 日志确认已加载** | `sudo bash -lc 'export PATH=/usr/local/bin:$PATH; pm2 logs hydrooj --lines 120 --nostream \| grep -i hydrooj-plugin-api'` | 应出现 **`apply plugin … hydrooj-plugin-api/index.ts`**（或带 **`scope hydrooj-plugin-api`**）。**没有这一行说明插件仍未被加载**，先不要做前端联调。 |
| **5. 本机自检** | `curl -sS -H 'Accept: application/json' 'http://127.0.0.1:8888/edu-sync-health'` | JSON 含 **`"ok":true`**、**`"service":"hydrooj-plugin-sync"`**。 |
| **6. 域名自检** | `curl -sS -H 'Accept: application/json' 'https://你的域名/edu-sync-health'` | 同上（需 **443** 与 DNS 正常）。 |
| **7. Bootstrap（可选）** | 浏览器已登录态或 `curl` 带 Cookie：`/edu-sync-bootstrap` | 已登录：**`userDataVersion`**；未登录：**401** 与 **`error: login_required`**，而非整站登录 HTML。 |

**权限提示**：非 root 用户请对 **`/root`** 下路径使用 **`sudo`**，**`pm2`** 在 **`sudo bash -lc 'export PATH=/usr/local/bin:$PATH; …'`** 中执行，避免 **`pm2: command not found`**。

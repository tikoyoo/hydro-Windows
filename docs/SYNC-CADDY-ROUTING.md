# 同步协议 P0：路径说明（`/api/sync/...` 为何无效）

## 根因（Hydro 路由）

Hydro 内核会注册 **`/api/:op`**（`@hydrooj/framework` → `applyApiHandler`），其中 **`:op` 仅占路径中的一段**。  
插件若注册 **`GET /api/sync/health`**，实际路径为三段（`api` / `sync` / `health`），**不匹配** `:op`，请求会落入其它兜底逻辑；匿名 **`Accept: application/json`** 时表现为 **`{"url":"/login?..."}`**，与 **`noCheckPermView`**、`apiRoutes` 白名单**无关**。（此前误判为插件白名单问题。）

插件 **`domainUsers`** 能工作是因为 **`/api/domainUsers`** 恰好是两段：**`/api` + `:op`**。

## 正确做法（本仓库已定稿）

在插件里使用 **不经 `/api/:op`** 劫持的路径前缀，例如：

- **`GET /extras/sync/health`** — 匿名自检（`SyncHealthHandler`，`noCheckPermView = true`）
- **`GET /extras/sync/bootstrap`** — 需登录，`SyncBootstrapHandler` 内校验 uid

Caddy **`@gateway`（`/api/*` → 8890）不会影响** **`/extras/*`**：二者一般走 **`handle { reverse_proxy 8888 }`**。

**无需**再给 `/api/sync` 单独写 Caddy 规则（旧文档中的 `@sync → 8888` 可作历史兼容保留，新版本以 **`/extras/...`** 为准）。

对应代码片段：**`plugin/snippets/syncBootstrap.ts`**  
安装脚本：**`scripts/install-hydro-plugin-sync-bootstrap.sh`**（会把旧 **`/api/sync/…`** **`index.ts`** 文案迁移成 **`/extras/...`**）

## 验证

```bash
curl -sS -H 'Accept: application/json' 'https://你的域名/extras/sync/health'
```

期望：`{"ok":true,"service":"hydrooj-plugin-sync","serverTime":...}`

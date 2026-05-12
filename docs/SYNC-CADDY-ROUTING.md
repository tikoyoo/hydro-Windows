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

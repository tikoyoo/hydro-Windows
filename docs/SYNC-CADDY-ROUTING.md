# 同步协议 P0：`/api/sync/*` 与 Caddy（8890 网关）

插件 **`syncBootstrap.ts`** 注册在 **Hydro 主进程（常见 `127.0.0.1:8888`）**。  
网关 **`hydro-api`（8890）** 只实现部分路径（例如 `domainUsers`）。

若 Caddy（或 Nginx）里使用类似规则：

```caddyfile
@gateway path /api/* /login /logout
handle @gateway {
  reverse_proxy http://127.0.0.1:8890
}
```

则 **`/api/sync/health`**、**`/api/sync/bootstrap`** 会先被送进 **8890**，插件在处理链上不可用，易出现匿名访问返回 **`{"url":"/login?..."}`** 或非预期响应。

## 修复（Caddy）

在 **`handle @gateway` 之前** 增加优先级更高的 **`@sync`**：

```caddyfile
@sync path /api/sync /api/sync/*
handle @sync {
  reverse_proxy http://127.0.0.1:8888
}

@gateway {
  path /api/* /login /logout
}
handle @gateway {
  reverse_proxy http://127.0.0.1:8890
}
```

然后：

```bash
cd /root/.hydro   # 或你的 Caddyfile 所在目录
caddy validate --config ./Caddyfile
pm2 restart caddy
```

## 验证

```bash
curl -sS -H 'Accept: application/json' 'https://你的域名/api/sync/health'
```

期望近似：`{"ok":true,"service":"hydrooj-plugin-sync","serverTime":...}`  
（仍需 Hydro 插件 **Route 注册**正确，且 **`const apiRoutes` 白名单中包含 `sync_health` / `sync_bootstrap`**。若直连 `127.0.0.1:8888` 仍返回 `\"url\":\"/login\"`，多为 **apiRoutes 未补全**：在服务器 `git pull` 后重新执行 **`bash scripts/install-hydro-plugin-sync-bootstrap.sh`**，脚本会仅在缺失时补齐白名单—见仓库内脚本说明。）

**bootstrap**（需登录 Cookie）：

```bash
curl -sS -H 'Accept: application/json' -b '你的 Cookie' \
  'https://你的域名/api/sync/bootstrap'
```

## 与本仓库文件的对应关系

完整合并示例：**`caddy/Caddyfile.gateway-and-sync.example`**

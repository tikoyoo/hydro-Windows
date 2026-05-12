# Caddy 启用 HTTPS（oj.antmaker.vip）

Caddy 对「仅写主机名、不写 `:80`」的站点块默认启用 **TLS**，并通过 **ACME（Let’s Encrypt）** 签发证书；前提是 **DNS 指向本机** 且 **80 / 443 可从公网访问**。

## 1. 前置检查

| 项 | 说明 |
|----|------|
| DNS | `oj.antmaker.vip` 的 **A** 记录 → 服务器公网 IP（与 `curl` 看到的 IP 一致） |
| 防火墙 / 安全组 | 放行 **TCP 80、443** |
| 80 端口 | ACME **HTTP-01** 验证需要（Caddy 默认会用） |

## 2. 配置内容

本仓库示例：

- **`caddy/Caddyfile.example`** — 极简（domainUsers→8890，其余→8888）。
- **`caddy/Caddyfile.gateway-and-sync.example`** — 与 **`/root/.hydro` 生产模板**一致：含 **`/api/run`**、**`@gateway`→8890**、以及 **`@sync`→8888**（同步协议必选）。

要点：

- 站点地址写 **`oj.antmaker.vip`**（不写 `http://`），由 Caddy 提供 **HTTPS**。
- **`/api/domainUsers`** 反代到 **`127.0.0.1:8890`**（路径完整转发，见文件内注释）。
- 其余反代到 Hydro 主服务（示例为 **`127.0.0.1:8888`**，按你机器实际修改）。

请把示例 **合并进** 你服务器上正在使用的 Caddy 配置（你当前已在用 Caddy，切勿未备份就整文件替换）。若你使用 **JSON 配置** 或 **import 多文件**，把等价 `reverse_proxy` 规则迁过去即可。

## 3. 重载 Caddy

常见方式（择一）：

```bash
caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
# 或：caddy reload --config /path/to/Caddyfile
```

查看日志确认无 ACME 报错：

```bash
journalctl -u caddy -f --no-pager
```

## 4. 验证

```bash
curl -sSI https://oj.antmaker.vip/ | head -n 15
curl -sS -H 'Accept: application/json' 'https://oj.antmaker.vip/api/domainUsers?domainId=system&page=1&limit=1&sortField=rp&sortOrder=desc' | head -c 400
```

期望：TLS 握手成功；`domainUsers` 返回 JSON（与 HTTP 时代一致）。

## 5. Hydro / 前端

主站改为 **HTTPS** 后，若 Hydro 或前端写死了 **`http://` 绝对地址**，需改为 **`https://`** 或相对路径，否则会出现 **混合内容** 或 Cookie **`Secure`** 与站点不一致等问题。本地开发仓库 `hydroforwindows` 里 `vite.config.js` 的 **`HYDRO_ORIGIN`** 已改为 `https://oj.antmaker.vip` 以便与线上一致。

## 6. 故障排查

- **证书申请失败**：检查 80 是否对外开放、DNS 是否已生效、本机是否已有其他程序占用 80。
- **502**：检查 `reverse_proxy` 上游端口是否与 `pm2` / Hydro 一致。
- **仍走 HTTP**：浏览器清缓存或用隐身窗口访问 `https://...`。

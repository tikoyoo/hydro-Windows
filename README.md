# hydro-Windows

本仓库从 **`hydroforwindows`** 项目中抽出 **在 Hydro 服务器上需要部署或对照的片段**（网关路由、插件 handler、补丁、安装脚本），便于在 Windows 本机或另一台机器上版本化，并与 `https://github.com/tikoyoo/hydro-Windows` 同步。

## 与服务器路径的对应关系

| 本仓库路径 | 典型服务器路径 / 用途 |
|------------|------------------------|
| `gateway/snippets/GET-domainUsers-route.fragment.js` | 合并进 **`/root/hydro-api-gateway.js`** 的 `routes`（`GET:/api/domainUsers`） |
| `plugin/snippets/syncBootstrap.ts` | 复制为 **`/root/hydrooj-plugin-api/src/handlers/syncBootstrap.ts`**，并在 `index.ts` 注册路由 |
| `patches/domain-ranking-json.patch` | 在 Hydro **源码根**对 `packages/hydrooj/src/handler/domain.ts` 执行 `git apply` |
| `scripts/install-hydro-plugin-sync-bootstrap.sh` | 在 **已 clone 本仓库** 的机器上执行，一键复制 handler 并修补 `index.ts` |

## 与「本地完整前端」的关系

完整 React 前端仍在 **`hydroforwindows`**（桌面另一目录）。本仓库 **不包含** `src/` 构建树；若要把前端改动也推到 GitHub，请在 `hydroforwindows` 里单独配置 remote 或子模块。

## 关于「和服务器做 diff」

本仓库只保存 **片段与文档**。服务器上的 **`hydro-api-gateway.js`**、**`hydrooj-plugin-api` 完整 `index.ts`** 等若未拷贝到本机，无法做逐字节 diff。请从服务器 `scp`/`cat` 出文件后放到本仓库的 `vendor/`（可自行建）再对比；片段文件则可直接与服务器上对应段落对照。

## 文档

- `docs/SERVER-CHANGES-LOG.md` — 根据分析日志整理的 **2026-05-11 / 05-12** 服务器侧变更摘要  
- `docs/RANKING-PATCH.md` — 全站排名 JSON 补丁与网关说明（路径已改为本仓库）
- `docs/CADDY-HTTPS.md` — 主站 **HTTPS**（Let’s Encrypt）  
- `docs/SYNC-CADDY-ROUTING.md` — **`/api/sync/*` 必须反代到 8888**，勿被 8890 网关「整块 /api」吞掉  
- `caddy/Caddyfile.example` — 极简  
- `caddy/Caddyfile.gateway-and-sync.example` — **生产合并模板**（8890 + 同步 + HTTPS 站点名）

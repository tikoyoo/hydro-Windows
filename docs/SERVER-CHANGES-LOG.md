# 服务器相关变更摘要（来自 hydroforwindows 分析日志）

## 2026-05-11

- **网关 `hydro-api`（8890）**：`script path` 为 `/root/hydro-api-gateway.js`。在 `routes` 中增加 **`GET:/api/domainUsers`**，直连 Mongo `domain.user`，避免未匹配路由走 `proxyToHydro` → 8888 导致匿名请求被重定向到登录页。
- **插件 `/root/hydrooj-plugin-api`**：`index.ts` 注册 `api_domain_users`；`handlers/domainUser.ts` 需正确绑定 `domainId` 等查询参数。
- **可选补丁**：`patches/domain-ranking-json.patch` 修改 Hydro 核心 `DomainRankHandler`，使 `/ranking` 的 JSON 与网页数据字段一致。

## 2026-05-12

- **同步协议 P0**：**`GET /edu-sync-health`**（匿名）、**`GET /edu-sync-bootstrap`**（未登录 401 JSON）；勿用 **`/api/sync/...`**（与 **`/api/:op`** 冲突）。Mongo：**`edu_user_sync`**。见 **`docs/SYNC-CADDY-ROUTING.md`**。
- **前端**（在 `hydroforwindows` 仓库）：`syncApi.js`、`AuthContext` 在登录/恢复会话后拉取 bootstrap；登出清理缓存。
- **安装**：使用本仓库 `scripts/install-hydro-plugin-sync-bootstrap.sh`（在服务器上 clone 本仓库后执行）。
- **HTTPS**：Caddy 站点由 `:80` 改为 **`oj.antmaker.vip`**，云防火墙放行 **443**；详见 `docs/CADDY-HTTPS.md`。

*详细表格与命令见原日志 `hydroforwindows/docs/project-analysis-log.md` §19 起。*

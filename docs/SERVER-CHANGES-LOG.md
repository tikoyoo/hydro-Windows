# 服务器相关变更摘要（来自 hydroforwindows 分析日志）

## 2026-05-11

- **网关 `hydro-api`（8890）**：`script path` 为 `/root/hydro-api-gateway.js`。在 `routes` 中增加 **`GET:/api/domainUsers`**，直连 Mongo `domain.user`，避免未匹配路由走 `proxyToHydro` → 8888 导致匿名请求被重定向到登录页。
- **插件 `/root/hydrooj-plugin-api`**：`index.ts` 注册 `api_domain_users`；`handlers/domainUser.ts` 需正确绑定 `domainId` 等查询参数。
- **可选补丁**：`patches/domain-ranking-json.patch` 修改 Hydro 核心 `DomainRankHandler`，使 `/ranking` 的 JSON 与网页数据字段一致。

## 2026-05-12

- **同步协议 P0**：插件增加 `SyncHealthHandler`（`GET /api/sync/health`）、`SyncBootstrapHandler`（`GET /api/sync/bootstrap`，需登录）；数据集合 **`edu_user_sync`**（按 uid）。
- **前端**（在 `hydroforwindows` 仓库）：`syncApi.js`、`AuthContext` 在登录/恢复会话后拉取 bootstrap；登出清理缓存。
- **安装**：使用本仓库 `scripts/install-hydro-plugin-sync-bootstrap.sh`（在服务器上 clone 本仓库后执行）。

*详细表格与命令见原日志 `hydroforwindows/docs/project-analysis-log.md` §19、§20。*

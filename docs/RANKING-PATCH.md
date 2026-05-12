# 全站排名 JSON 与网页数据一致（后端补丁）

## 作用

浏览器打开排名页时，数据直接来自数据库，字段齐全。前端用 `Accept: application/json` 请求同一路径时，Hydro 默认可能裁掉部分数字。本补丁在 **`DomainRankHandler`** 里对 JSON 请求单独打包，使 `udocs` 等与网页同源。

## 应用补丁

1. 在服务器 Hydro **源码**中找到：`packages/hydrooj/src/handler/domain.ts`
2. 在 **Hydro 源码根目录**执行：

```bash
git apply /path/to/hydro-Windows/patches/domain-ranking-json.patch
```

（Windows 示例：将 `/path/to` 换为 `C:/Users/.../Desktop/hydro-Windows`。）

若 `git apply` 失败，打开 `patches/domain-ranking-json.patch` 对照 `DomainRankHandler` 的 `get` 方法手工合并。

3. 重新编译并重启 Hydro。

## 网关 `domainUsers`

若 `hydro-api` 使用 `/root/hydro-api-gateway.js` 且 `routes` 中没有 `GET:/api/domainUsers`，可参考本仓库 **`gateway/snippets/GET-domainUsers-route.fragment.js`** 合并进 `routes`，然后 **`pm2 restart hydro-api`**。

## 同步协议 P0

将 **`plugin/snippets/syncBootstrap.ts`** 部署到插件目录并注册路由后，可用主站域名测试：

```bash
curl -sS -H 'Accept: application/json' 'https://你的主站域名/api/sync/health'
```

匿名 `curl` 若仍返回登录跳转 JSON，需结合 Hydro 权限与路由配置判断；**已登录**或带 Cookie 时再测 `bootstrap`。

一键安装：在已 clone **本仓库** 的机器上执行 `sudo bash scripts/install-hydro-plugin-sync-bootstrap.sh`。

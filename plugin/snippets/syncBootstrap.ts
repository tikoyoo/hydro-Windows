/**
 * 复制到服务器 `/root/hydrooj-plugin-api/src/handlers/`（或你项目中的 handlers 目录），
 * 在 `src/index.ts` 中 import 并注册两条路由（见文件末尾注释）。
 *
 * 依赖：Hydro 插件工程已能正常 `import { Handler, db } from 'hydrooj'`（与 domainUser 等一致）。
 *
 * Mongo 集合 `edu_user_sync`：每条 `{ _id: 'uid_<数字>', uid, userDataVersion, updatedAt }`。
 * P0 仅提供「读版本 + 建文档」；后续在判题完成、报名等写路径里对对应 uid `$inc: { userDataVersion: 1 }` 即可驱动前端增量。
 */

import { Handler, db } from 'hydrooj';

const COL = 'edu_user_sync';

/**
 * 匿名健康检查。
 * Hydro 在 handler/create/http 对 Guest 会先 `checkPerm(PERM_VIEW)`；
 * 仅用 class field 个别编译/加载链下可能未带上，故在构造函数里再写一次。
 * 勿使用 `/api/sync/health`：`/api/:op` 为单段 op，多段路径匹配不到本 Route。
 */
export class SyncHealthHandler extends Handler {
  noCheckPermView = true;

  constructor(context: any, cordisCtx: any) {
    super(context, cordisCtx);
    this.noCheckPermView = true;
  }

  async get() {
    this.response.body = {
      ok: true,
      service: 'hydrooj-plugin-sync',
      serverTime: Date.now(),
    };
  }
}

/**
 * 需在已登录态才返回 userDataVersion；未登录仍应返回 JSON 401，而不是整站登录跳转。
 * 因此对 Guest 也要 `noCheckPermView`，在 get() 内自行判断 uid。
 */
export class SyncBootstrapHandler extends Handler {
  noCheckPermView = true;

  constructor(context: any, cordisCtx: any) {
    super(context, cordisCtx);
    this.noCheckPermView = true;
  }

  async get() {
    const uid = Number(this.user?._id ?? this.user?.uid ?? 0);
    if (!Number.isFinite(uid) || uid <= 1) {
      this.response.status = 401;
      this.response.body = {
        error: 'login_required',
        userDataVersion: 0,
        serverTime: Date.now(),
        resources: {},
      };
      return;
    }

    const coll = db.collection(COL);
    const _id = `uid_${uid}`;
    let doc = await coll.findOne({ _id });
    if (!doc) {
      const row = { _id, uid, userDataVersion: 1, updatedAt: new Date() };
      try {
        await coll.insertOne(row);
        doc = row;
      } catch {
        doc = await coll.findOne({ _id });
      }
    }

    this.response.body = {
      userDataVersion: typeof doc?.userDataVersion === 'number' ? doc.userDataVersion : 1,
      serverTime: Date.now(),
      resources: {},
    };
  }
}

/*
在 src/index.ts 中：

import { SyncHealthHandler, SyncBootstrapHandler } from './handlers/syncBootstrap';

ctx.Route('sync_health', '/edu-sync-health', SyncHealthHandler);
ctx.Route('sync_bootstrap', '/edu-sync-bootstrap', SyncBootstrapHandler);

然后：cd /root/hydrooj-plugin-api && npm run build（若有）&& pm2 restart hydrooj
*/

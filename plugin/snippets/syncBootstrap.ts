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

/** 无需登录：给运维 / 前置检查用（勿暴露敏感信息） */
export class SyncHealthHandler extends Handler {
  noCheckPermView = true;

  async get() {
    this.response.body = {
      ok: true,
      service: 'hydrooj-plugin-sync',
      serverTime: Date.now(),
    };
  }
}

/** 需登录：返回当前用户的 userDataVersion（不存在则初始化为 1） */
export class SyncBootstrapHandler extends Handler {
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

ctx.Route('sync_health', '/api/sync/health', SyncHealthHandler);
ctx.Route('sync_bootstrap', '/api/sync/bootstrap', SyncBootstrapHandler);

然后：cd /root/hydrooj-plugin-api && npm run build（若有）&& pm2 restart hydrooj
*/

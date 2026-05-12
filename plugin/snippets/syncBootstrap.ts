/**
 * 同步协议 P0 + P1 handler。
 *
 * P0（HTTP）：
 *   SyncHealthHandler  — GET /edu-sync-health（匿名）
 *   SyncBootstrapHandler — GET /edu-sync-bootstrap（需登录，返回 userDataVersion）
 *
 * P1（WebSocket）：
 *   SyncConnectionHandler — WS /edu-sync-conn
 *   连接后监听 Hydro EventBus（record/change 等），
 *   当涉及当前用户时 $inc: { userDataVersion: 1 } 并推送 { type, userDataVersion, resources }。
 *
 * Mongo 集合 `edu_user_sync`：每条 `{ _id: 'uid_<数字>', uid, userDataVersion, updatedAt }`。
 */

import { Handler, ConnectionHandler, db, subscribe } from 'hydrooj';

const COL = 'edu_user_sync';

/** $inc userDataVersion 并返回新值；resources 标记哪些资源变了 */
async function bumpVersion(uid: number, resources: Record<string, any> = {}): Promise<number> {
  const coll = db.collection(COL);
  const _id = `uid_${uid}`;
  // 确保 doc 存在
  await coll.updateOne({ _id }, { $setOnInsert: { uid, updatedAt: new Date() } }, { upsert: true });
  const doc = await coll.findOneAndUpdate(
    { _id },
    { $inc: { userDataVersion: 1 }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after', upsert: true },
  );
  return doc?.userDataVersion ?? 1;
}

// ─── P0：HTTP handlers ──────────────────────────────────────

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

// ─── P1：WebSocket ConnectionHandler ────────────────────────

/**
 * WS /edu-sync-conn
 *
 * 连接后监听 Hydro EventBus，当事件涉及当前用户时：
 * 1. $inc userDataVersion
 * 2. send({ type: 'sync/version', userDataVersion, resources })
 *
 * resources 字段标记哪些资源类别发生了变化，前端据此精准刷新缓存。
 */
export class SyncConnectionHandler extends ConnectionHandler {
  noCheckPermView = true;
  private uid = 0;

  constructor(context: any, cordisCtx: any) {
    super(context, cordisCtx);
    this.noCheckPermView = true;
  }

  async prepare() {
    this.uid = Number(this.user?._id ?? this.user?.uid ?? 0);
    if (!Number.isFinite(this.uid) || this.uid <= 1) {
      this.send(JSON.stringify({ type: 'sync/error', error: 'login_required' }));
      this.close();
      return;
    }
    // 发送当前版本号，前端可用来对比
    const coll = db.collection(COL);
    const _id = `uid_${this.uid}`;
    let doc = await coll.findOne({ _id });
    if (!doc) {
      const row = { _id, uid: this.uid, userDataVersion: 1, updatedAt: new Date() };
      try { await coll.insertOne(row); doc = row; } catch { doc = await coll.findOne({ _id }); }
    }
    this.send(JSON.stringify({
      type: 'sync/hello',
      userDataVersion: doc?.userDataVersion ?? 1,
      serverTime: Date.now(),
    }));
  }

  /** 评测完成 / 状态变更 */
  @subscribe('record/change')
  async onRecordChange(rdoc: any) {
    if (rdoc.uid !== this.uid) return;
    const resources: Record<string, any> = { stats: 1 };
    if (rdoc._id) resources.record = String(rdoc._id);
    if (rdoc.contest) resources.contest = String(rdoc.contest);
    const userDataVersion = await bumpVersion(this.uid, resources);
    this.send(JSON.stringify({ type: 'sync/version', userDataVersion, resources, serverTime: Date.now() }));
  }

  /** 竞赛 / 排名相关事件（domain 缓存刷新时可能涉及排名变动） */
  @subscribe('domain/delete-cache')
  async onDomainCacheChange(domainId: string) {
    // 排名等统计在 domain 层面缓存，清除时推送 ranking 变化
    const resources: Record<string, any> = { ranking: 1 };
    const userDataVersion = await bumpVersion(this.uid, resources);
    this.send(JSON.stringify({ type: 'sync/version', userDataVersion, resources, serverTime: Date.now() }));
  }

  async cleanup() {
    // ConnectionHandler 生命周期结束时自动清理 @subscribe 监听
  }
}

/*
在 src/index.ts 中：

import { SyncHealthHandler, SyncBootstrapHandler, SyncConnectionHandler } from './handlers/syncBootstrap';

ctx.Route('sync_health', '/edu-sync-health', SyncHealthHandler);
ctx.Route('sync_bootstrap', '/edu-sync-bootstrap', SyncBootstrapHandler);
ctx.Connection('sync_conn', '/edu-sync-conn', SyncConnectionHandler);

然后：cd /root/hydrooj-plugin-api && pm2 restart hydrooj
*/

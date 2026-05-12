/**
 * 同步协议 P0 + P1 handler。
 *
 * P0（HTTP）：
 *   SyncHealthHandler  — GET /edu-sync-health（匿名）
 *   SyncBootstrapHandler — GET /edu-sync-bootstrap（需登录，返回 userDataVersion）
 *
 * P1（WebSocket）：
 *   SyncConnectionHandler — WS /edu-sync-conn
 *   连接后监听 Hydro EventBus（record/change、user/delcache、domain/delete-cache、
 *   contest/add|edit|del、document/add|set 等），在当前连接用户相关时
 *   $inc: { userDataVersion: 1 } 并推送 { type, userDataVersion, resources }。
 *
 * Mongo 集合 `edu_user_sync`：每条 `{ _id: 'uid_<数字>', uid, userDataVersion, updatedAt }`。
 */

import { Handler, ConnectionHandler, db, subscribe } from 'hydrooj';

const COL = 'edu_user_sync';

/** Hydro `document.docType`，与 packages/hydrooj/src/model/document.ts 对齐 */
const DOC_PROBLEM = 10;
const DOC_CONTEST = 30;
const DOC_TRAINING = 40;

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

  /** bumpVersion + 推送 sync/version */
  private async notify(resources: Record<string, any>) {
    const userDataVersion = await bumpVersion(this.uid, resources);
    this.send(JSON.stringify({
      type: 'sync/version',
      userDataVersion,
      resources,
      serverTime: Date.now(),
    }));
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
    await this.notify(resources);
  }

  /** 用户缓存失效（资料/权限变更等） */
  @subscribe('user/delcache')
  async onUserDelcache(content: string | true) {
    if (content === true) {
      await this.notify({ stats: 1, ranking: 1 });
      return;
    }
    if (typeof content === 'string') {
      const s = content.trim();
      if (s.startsWith('{')) {
        try {
          const u = JSON.parse(s);
          if (u && Number(u._id) === this.uid) await this.notify({ stats: 1, ranking: 1 });
        } catch {
          /* ignore */
        }
        return;
      }
      if (this.domain?._id && s !== this.domain._id) return;
      await this.notify({ stats: 1, ranking: 1 });
    }
  }

  /** 竞赛 / 排名相关事件（domain 缓存刷新时可能涉及排名变动） */
  @subscribe('domain/delete-cache')
  async onDomainCacheChange(domainId: string) {
    if (this.domain?._id && domainId !== this.domain._id) return;
    await this.notify({ ranking: 1 });
  }

  @subscribe('contest/add')
  async onContestAdd(payload: any, id: any) {
    if (payload && this.domain?._id && payload.domainId && payload.domainId !== this.domain._id) return;
    const resources: Record<string, any> = { contest: String(id) };
    if (payload?.rule === 'homework') resources.homework = String(id);
    await this.notify(resources);
  }

  @subscribe('contest/edit')
  async onContestEdit(tdoc: any) {
    if (!tdoc?._id) return;
    if (this.domain?._id && tdoc.domainId && tdoc.domainId !== this.domain._id) return;
    const tid = String(tdoc._id);
    const resources: Record<string, any> = { contest: tid };
    if (tdoc?.rule === 'homework') resources.homework = tid;
    await this.notify(resources);
  }

  @subscribe('contest/del')
  async onContestDel(domainId: string, tid: any) {
    if (this.domain?._id && domainId !== this.domain._id) return;
    await this.notify({ contest: String(tid) });
  }

  @subscribe('document/set')
  async onDocumentSet(domainId: string, docType: number, docId: any) {
    if (this.domain?._id && domainId !== this.domain._id) return;
    if (docType === DOC_CONTEST) {
      await this.notify({
        contest: String(docId),
        homework: String(docId),
      });
      return;
    }
    if (docType === DOC_TRAINING) {
      await this.notify({ course: String(docId) });
      return;
    }
    if (docType === DOC_PROBLEM) {
      await this.notify({ stats: 1, problem: String(docId) });
      return;
    }
    await this.notify({ stats: 1 });
  }

  @subscribe('document/add')
  async onDocumentAdd(doc: any) {
    if (!doc) return;
    if (this.domain?._id && doc.domainId && doc.domainId !== this.domain._id) return;
    const docType = Number(doc.docType);
    const rawId = doc.docId != null ? doc.docId : doc._id;
    if (docType === DOC_CONTEST) {
      await this.notify({
        contest: String(rawId),
        homework: String(rawId),
      });
      return;
    }
    if (docType === DOC_TRAINING) {
      await this.notify({ course: String(rawId) });
      return;
    }
    if (docType === DOC_PROBLEM) {
      await this.notify({ stats: 1, problem: String(rawId) });
      return;
    }
    await this.notify({ stats: 1 });
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

/**
 * 插入到 /root/hydro-api-gateway.js 的 `const routes = { ... }` 里：
 * 放在 `'GET:/api/record': ...` 与 `'POST:/api/submit': ...` 之间（或任意其它 GET 路由旁），注意末尾逗号。
 *
 * 作用：在 8890 网关直接用 Mongo 读 `domain.user`，与插件逻辑一致，且不经过 8888，故无 Cookie 也不会跳登录。
 */
  'GET:/api/domainUsers': async (req, res, url) => {
    const domainId = String(url.searchParams.get('domainId') || 'system').trim() || 'system';
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    let limit = parseInt(url.searchParams.get('limit') || '100', 10) || 100;
    limit = Math.min(500, Math.max(1, limit));
    const sortFieldRaw = url.searchParams.get('sortField') || 'rp';
    const sortOrder = (url.searchParams.get('sortOrder') || 'desc') === 'asc' ? 1 : -1;
    const uidsStr = (url.searchParams.get('uids') || '').trim();
    const SORT_WHITELIST = new Set(['rp', 'nAccept', 'nSubmit', 'rank', 'level', 'nLiked', 'displayName']);
    const sortField = SORT_WHITELIST.has(sortFieldRaw) ? sortFieldRaw : 'rp';

    const query = { uid: { $gt: 1 }, join: true };
    if (uidsStr) {
      const uidList = uidsStr.split(',').map((id) => parseInt(id.trim(), 10)).filter((id) => id > 1);
      if (uidList.length > 0) query.uid = { $in: uidList };
    } else {
      query.rp = { $gt: 0 };
    }

    const coll = db.collection('domain.user');
    const total = await coll.countDocuments({ domainId, ...query });
    const skip = (page - 1) * limit;
    const users = await coll
      .find({ domainId, ...query })
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .project({ uid: 1, rp: 1, nAccept: 1, nSubmit: 1, nLiked: 1, rank: 1, level: 1, displayName: 1 })
      .toArray();

    return { users, total, page, limit };
  },

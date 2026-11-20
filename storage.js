/**
 * 会话存储：电脑端走本机服务（data/*.json），手机/静态托管走 IndexedDB。
 * 两边暴露同一套接口，UI 不用关心数据存在哪。
 */

const DB_NAME = 'forgevision';
const STORE = 'conversations';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(conv) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(conv);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ------------------------------------------------------------------ */

class ServerStore {
  constructor(getToken) {
    this.mode = 'server';
    this.getToken = getToken;
  }

  headers(extra = {}) {
    const token = this.getToken();
    return token ? { ...extra, 'x-afv-session': token } : extra;
  }

  async list() {
    const res = await fetch('/api/conversations', { headers: this.headers() });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '读取会话失败');
    const data = await res.json();
    return data.conversations || [];
  }

  async get(id) {
    const res = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { headers: this.headers() });
    if (!res.ok) return null;
    const data = await res.json();
    return data.conversation || null;
  }

  async save(conv) {
    const res = await fetch(`/api/conversations/${encodeURIComponent(conv.id)}`, {
      method: 'PUT',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(conv),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '保存失败');
    }
  }

  async remove(id) {
    await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
  }

  async exportAll() {
    const res = await fetch('/api/export', { headers: this.headers() });
    if (!res.ok) throw new Error('导出失败');
    return res.json();
  }

  async importAll(payload) {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('导入失败');
    return res.json();
  }
}

class LocalStore {
  constructor() {
    this.mode = 'local';
  }

  async list() {
    const rows = await idbAll();
    return rows
      .map((conv) => ({
        id: conv.id,
        title: conv.title || '未命名对话',
        createdAt: conv.createdAt || 0,
        updatedAt: conv.updatedAt || 0,
        model: conv.model || 'deepseek-V4.1-Flash',
        pinned: Boolean(conv.pinned),
        count: conv.messages ? conv.messages.length : 0,
      }))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }

  async get(id) {
    return idbGet(id);
  }

  async save(conv) {
    // 合并而不是整条替换：就算上层传进来的对象缺了字段，也不会把已有内容抹掉
    const prev = await idbGet(conv.id);
    const next = { ...(prev || {}), ...conv, updatedAt: Date.now() };
    if (!Array.isArray(next.messages)) {
      next.messages = Array.isArray(prev?.messages) ? prev.messages : [];
    }
    await idbPut(next);
  }

  async remove(id) {
    await idbDelete(id);
  }

  async exportAll() {
    const conversations = await idbAll();
    return { ok: true, exportedAt: Date.now(), app: 'ForgeVision', conversations };
  }

  async importAll(payload) {
    const list = Array.isArray(payload.conversations) ? payload.conversations : [];
    for (const conv of list) {
      if (!conv || !conv.id) continue;
      await idbPut(conv);
    }
    return { ok: true, saved: list.length };
  }
}

export function createServerStore(getToken) {
  return new ServerStore(getToken);
}

export function createLocalStore() {
  return new LocalStore();
}

/**
 * ForgeVision · 推想视限
 * 前端主程序：无框架，原生 DOM。
 */

import { renderMarkdown, escapeHtml } from './markdown.js';
import { createServerStore, createLocalStore } from './storage.js';

const $ = (selector, root = document) => root.querySelector(selector);

/**
 * 模型清单，顺序就是菜单里的顺序。
 * id       —— 内部标识，会话里存的就是它（改了会丢历史，别动）
 * label    —— 菜单上显示的名字
 * upstream —— 真正发给 API 的模型名，必须和厂商文档一致
 * baseUrl  —— 该厂商的 OpenAI 兼容网关，用户可以在设置里覆盖
 * logo     —— 厂商官方彩色 logo（public/logos/ 下，来自 @lobehub/icons-static-svg 原图）
 * mono     —— 这家 logo 本身就是黑白的，深色模式下要反相
 */
const MODELS = [
  {
    id: 'deepseek-V4.1-Flash',
    label: 'Deep-V4.1',
    upstream: 'deepseek-flash',
    baseUrl: 'https://api.deepseek.com',
    logo: 'logos/deepseek.svg',
  },
  {
    id: 'deepseek-v4.1-flash-free',
    label: 'Deep-V4.1.f',
    upstream: 'deepseek-v4.1-flash-free',
    baseUrl: 'https://opencode.ai/inference/openai/v1',
    logo: 'logos/deepseek.svg',
  },
  {
    id: 'Gemini 3.5 Flash-Lite',
    label: 'Gemini-3.5-F-L',
    upstream: 'gemini-3.5-flash-lite',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    logo: 'logos/gemini.svg',
  },
  {
    id: 'Grok 4.5',
    label: 'Grok-4.5',
    upstream: 'grok-4-5',
    baseUrl: 'https://api.x.ai/v1',
    logo: 'logos/grok.svg',
    mono: true,
  },
  {
    id: 'GPT-6 Luna',
    label: 'GPT-6 Luna',
    upstream: 'gpt-6-luna',
    baseUrl: 'https://api.openai.com/v1',
    logo: 'logos/openai.svg',
    mono: true,
  },
  {
    id: 'Hy4 flash',
    label: 'Hy4 flash',
    upstream: 'hy4-flash-free',
    baseUrl: 'https://opencode.ai/inference/openai/v1',
    logo: 'logos/hunyuan.svg',
  },
  {
    id: 'Qwen-3.7-Flash',
    label: 'Qwen-3.7-Flash',
    upstream: 'qwen3.7-flash',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    logo: 'logos/qwen.svg',
  },
  {
    id: 'GLM-5.3-Flash',
    label: 'GLM-5.3-Flash',
    upstream: 'glm-5.3-flash',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    logo: 'logos/chatglm.svg',
  },
  {
    id: 'Claude Haiku 4.5',
    label: 'Claude Haiku 4.5',
    upstream: 'claude-haiku-4-5',
    baseUrl: 'https://api.anthropic.com/v1',
    logo: 'logos/claude.svg',
  },
  {
    id: 'Inkling 2 Small',
    label: 'Inkling 2 Small',
    upstream: 'inkling-2-small-free',
    baseUrl: 'https://opencode.ai/inference/openai/v1',
    logo: 'logos/opencode.svg',
    mono: true,
  },
  {
    id: 'Fledge Alpha Free',
    label: 'Fledge Alpha Free',
    upstream: 'fledge-alpha-free',
    baseUrl: '',
    logo: 'logos/opencode.svg',
    mono: true,
  },
];

const APP_VERSION = '0.2.0-rc.5';

const SUB_TITLES = {
  account: '账号',
  models: '模型',
  providers: '模型提供商',
  data: '数据',
  language: '语言',
  appearance: '外观',
  font: '字体大小',
  terms: '服务协议',
  help: '帮助与反馈',
  update: '检查更新',
  skins: '下载更多皮肤',
};

const THEME_LABELS = { light: '浅色', dark: '深色', auto: '跟随系统' };

const SKINS = [
  { id: 'default', name: '默认', colors: ['#ffffff', '#1d2126', '#4d6bfe'] },
  { id: 'mist', name: '雾灰', colors: ['#f8f9fa', '#262c33', '#5b7083'] },
  { id: 'paper', name: '暖纸', colors: ['#fbf8f2', '#2b2620', '#a2653a'] },
  { id: 'ocean', name: '深海', colors: ['#f4f8fb', '#16262f', '#2f6f8f'] },
];

const UPDATE_REPO = 'i-Alizabeth/Alizabeth-ForgeVision-Chat';

const LS = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(`afv.${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`afv.${key}`, JSON.stringify(value));
    } catch {
      /* 隐私模式下可能不可写 */
    }
  },
};

const uid = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

let pressTimer = 0;
let suppressClick = false;

const DEFAULT_SETTINGS = {
  theme: 'light',
  skin: 'default',
  fontSize: 16,
  model: MODELS[0].id,
  apiKey: '',
  webSearch: false,
  language: 'system',
  followSystem: false,
};

const state = {
  mode: 'local',
  config: { models: MODELS, authRequired: false, apiKeyReady: false },
  store: null,
  token: LS.get('token', ''),
  settings: { ...DEFAULT_SETTINGS, ...LS.get('settings', {}) },
  modelConfigs: LS.get('modelConfigs', {}),
  providers: LS.get('providers', []),
  downloadedSkins: LS.get('downloadedSkins', []),
  account: LS.get('account', null),
  convs: [],
  cache: new Map(),
  current: null,
  sending: false,
  abort: null,
  filter: '',
  pickerMode: 'attach',
  menu: null,
  typewriter: null,
  selectMode: false,
  selected: new Set(),
  login: { mode: 'login', channel: 'phone', code: '', timer: null },
};

/* ================================================================== */
/* 启动                                                                */
/* ================================================================== */

async function boot() {
  applyTheme();
  applySkin();
  applyFontSize();
  await detectMode();
  bindUI();
  updateAccountUI();
  syncModelLabels();
  syncSearchButton();

  if (state.mode === 'server' && state.config.authRequired && !state.token) {
    showLock();
    return;
  }
  await enterApp();
  setTimeout(() => checkForUpdate(false), 1200);
}

async function detectMode() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('no server');
    const data = await res.json();
    if (!data || data.name !== 'ForgeVision') throw new Error('not forgevision');
    state.mode = 'server';
    state.config = data;
    state.store = createServerStore(() => state.token);
  } catch {
    state.mode = 'local';
    state.config = { models: MODELS, authRequired: false, apiKeyReady: false };
    state.store = createLocalStore();
  }
}

async function enterApp() {
  updateModeLabels();
  await refreshList();
  const params = new URLSearchParams(location.search);
  const target = params.get('c');
  if (target) await openConversation(target);
  else newChat(false);
  $('#lock').hidden = true;
}

/* ================================================================== */
/* 账户                                                                */
/* ================================================================== */

function maskPhone(phone) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function maskEmail(email) {
  const [name, domain] = String(email).split('@');
  if (!domain) return email;
  const head = name.slice(0, 3);
  const tail = name.length > 4 ? name.slice(-2) : '';
  return `${head}****${tail}@${domain}`;
}

function accountName() {
  if (!state.account) return '未登录';
  return state.account.nickname || state.account.phone || state.account.email || '已登录';
}

function accountSubtitle() {
  if (!state.account) return '点这里登录';
  if (state.account.email) return state.account.email;
  if (state.account.phone) return state.account.phone;
  return '已登录';
}

function updateAccountUI() {
  $('#sbUserName').textContent = accountName();
  $('#sbUserSub').textContent = accountSubtitle();
  $('#setAccountValue').textContent = state.account ? accountName() : '未登录';
}

function saveAccount() {
  LS.set('account', state.account);
  updateAccountUI();
}

/* ================================================================== */
/* 会话列表                                                            */
/* ================================================================== */

function dayStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupLabel(ts) {
  const today = dayStart(Date.now());
  const day = dayStart(ts);
  const diff = Math.round((today - day) / 86400000);
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff <= 7) return '7 天内';
  if (diff <= 30) return '30 天内';
  return '更早';
}

function timeLabel(ts) {
  const date = new Date(ts);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString() === date.toDateString();
  if (sameDay) return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (yesterday) return '昨天';
  if (date.getFullYear() === now.getFullYear()) {
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function convRowHtml(conv) {
  const active = state.current && state.current.id === conv.id;
  const selected = state.selectMode && state.selected.has(conv.id);
  const check = state.selectMode ? `<span class="sb-check"></span>` : '';
  const time = state.selectMode
    ? ''
    : `<span class="sb-item-time">${timeLabel(conv.updatedAt || conv.createdAt || Date.now())}</span>`;
  const del = state.selectMode
    ? ''
    : `<button class="sb-item-del" data-del="${conv.id}" title="删除对话" aria-label="删除对话">` +
      `<svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>`;
  return (
    `<div class="sb-item${selected ? ' is-selected' : ''}" role="button" tabindex="0" data-id="${conv.id}" aria-current="${active}">` +
    check +
    `<span class="sb-item-title">${escapeHtml(conv.title || '未命名对话')}</span>` +
    time +
    del +
    `</div>`
  );
}

function renderSessionHead() {
  const head = $('#sessHead');
  if (!head) return;
  if (state.selectMode) {
    const count = state.selected.size;
    head.classList.add('is-select');
    head.innerHTML =
      `<span>已选 ${count}</span>` +
      `<span class="sel-actions">` +
      `<button data-sel="export"${count ? '' : ' disabled'}>导出</button>` +
      `<button data-sel="delete"${count ? '' : ' disabled'}>删除</button>` +
      `<button data-sel="cancel">取消</button>` +
      `</span>`;
  } else {
    head.classList.remove('is-select');
    head.innerHTML = '<span>对话</span>';
  }
}

function renderList() {
  const list = $('#sessionList');
  const rows = state.convs;
  $('#sessionEmpty').hidden = rows.length > 0;
  list.hidden = rows.length === 0;
  renderSessionHead();

  const pinned = rows.filter((conv) => conv.pinned);
  const rest = rows.filter((conv) => !conv.pinned);

  const order = ['今天', '昨天', '7 天内', '30 天内', '更早'];
  const buckets = new Map(order.map((key) => [key, []]));
  for (const conv of rest) {
    const label = groupLabel(conv.updatedAt || conv.createdAt || 0);
    (buckets.get(label) || buckets.get('更早')).push(conv);
  }

  const html = [];
  if (pinned.length) {
    html.push('<div class="sb-group-title">置顶</div>');
    for (const conv of pinned) html.push(convRowHtml(conv));
  }
  for (const key of order) {
    const group = buckets.get(key);
    if (!group.length) continue;
    html.push(`<div class="sb-group-title">${key}</div>`);
    for (const conv of group) html.push(convRowHtml(conv));
  }
  list.innerHTML = html.join('');
}

async function refreshList() {
  try {
    state.convs = await state.store.list();
  } catch (err) {
    if (/密码|401|unauthor/i.test(err.message || '')) {
      showLock();
      return;
    }
    state.convs = [];
    toast(`读取会话失败：${err.message}`);
  }
  applyFilter();
}

function applyFilter() {
  const keyword = state.filter.trim().toLowerCase();
  if (!keyword) {
    renderList();
    return;
  }
  const saved = state.convs;
  state.convs = saved.filter((conv) => String(conv.title || '').toLowerCase().includes(keyword));
  renderList();
  state.convs = saved;
  if (!state.convs.some((conv) => String(conv.title || '').toLowerCase().includes(keyword))) {
    searchContents(keyword);
  }
}

let searchTimer = null;
function searchContents(keyword) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    const hits = [];
    await Promise.all(
      state.convs.map(async (conv) => {
        let full = state.cache.get(conv.id);
        if (!full) {
          try {
            full = await state.store.get(conv.id);
          } catch {
            full = null;
          }
          if (full) state.cache.set(conv.id, full);
        }
        if (!full) return;
        const found = (full.messages || []).some((m) => String(m.content || '').toLowerCase().includes(keyword));
        if (found) hits.push(conv);
      }),
    );
    if (state.filter.trim().toLowerCase() !== keyword) return;
    const saved = state.convs;
    state.convs = hits.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    renderList();
    state.convs = saved;
  }, 220);
}

/* ================================================================== */
/* 会话显示                                                            */
/* ================================================================== */

function newChat(focus = false) {
  stopStreaming();
  state.current = {
    id: uid(),
    title: '新对话',
    model: state.settings.model,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
  $('#flow').innerHTML = '';
  $('#chatTitle').textContent = '新对话';
  $('#input').value = '';
  autoGrow();
  updateSendState();
  showHero(true);
  renderList();
  closeDrawer();
  syncModelLabels();
  if (focus) setTimeout(() => $('#input').focus(), 40);
}

async function openConversation(id) {
  if (state.sending) stopStreaming();
  closeDrawer();
  let conv = state.cache.get(id) || null;
  if (!conv) {
    try {
      conv = await state.store.get(id);
    } catch (err) {
      toast(`打开失败：${err.message}`);
      return;
    }
  }
  if (!conv) {
    toast('这个对话不存在了');
    return;
  }
  state.cache.set(id, conv);
  state.current = conv;
  $('#chatTitle').textContent = conv.title || '未命名对话';
  renderMessages();
  showHero(false);
  renderList();
  syncModelLabels();
}

function messageNode(message, streaming = false) {
  const article = document.createElement('article');
  if (message.role === 'user') {
    article.className = 'msg msg-user';
    article.innerHTML = `<div class="bubble">${escapeHtml(message.content).replace(/\n/g, '<br />')}</div>`;
    return article;
  }
  article.className = 'msg msg-ai';
  article.dataset.id = message.id;
  article.innerHTML =
    `<div class="who"><span class="mark">AFV</span>FORGEVISION</div>` +
    `<div class="md"></div>` +
    `<div class="msg-actions">` +
    `<button class="msg-act" data-copy title="复制"><svg viewBox="0 0 16 16"><rect x="5" y="5" width="8" height="8"/><path d="M3 11V3h8"/></svg>复制</button>` +
    `</div>`;
  const body = $('.md', article);
  if (streaming) {
    body.innerHTML = '<span class="thinking"><i></i><i></i><i></i></span>';
  } else {
    body.innerHTML = renderMarkdown(message.content);
  }
  return article;
}

function renderMessages() {
  const flow = $('#flow');
  flow.innerHTML = '';
  for (const message of state.current.messages) {
    flow.appendChild(messageNode(message));
  }
  scrollToBottom(true);
}

function appendMessage(message, streaming = false) {
  const node = messageNode(message, streaming);
  $('#flow').appendChild(node);
  return node;
}

function showHero(on) {
  const hero = $('#hero');
  hero.classList.toggle('is-on', on);
  if (on) {
    if (!state.typewriter) state.typewriter = new HeadlineTypewriter($('#heroText'));
    state.typewriter.start();
  } else {
    state.typewriter?.stop(true);
  }
}

/* ================================================================== */
/* 发送与流式接收                                                      */
/* ================================================================== */

function buildPayload(messages) {
  return messages
    .filter((m) => String(m.content || '').trim())
    .map((m) => ({ role: m.role, content: m.content }));
}

function upstreamModel(modelId) {
  const found = MODELS.find((m) => m.id === modelId);
  return found?.upstream || modelId;
}

async function sendMessage() {
  const input = $('#input');
  const text = input.value.trim();
  if (!text || state.sending) return;

  if (!modelReady(currentModel())) {
    toast('这个模型还没填 API 密钥');
    openSettings();
    openSub('models');
    return;
  }

  if (!state.current) newChat();
  const conv = state.current;
  const userMessage = { id: uid(), role: 'user', content: text, createdAt: Date.now() };
  conv.messages.push(userMessage);
  if (!conv.title || conv.title === '新对话') {
    conv.title = makeTitle(text);
    $('#chatTitle').textContent = conv.title;
  }

  input.value = '';
  autoGrow();
  updateSendState();
  showHero(false);
  appendMessage(userMessage);
  scrollToBottom(true);
  await persist(conv, false);

  await reply(conv);
}

function makeTitle(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 26 ? `${clean.slice(0, 26)}…` : clean || '新对话';
}

async function reply(conv) {
  const payload = buildPayload(conv.messages);
  const assistant = { id: uid(), role: 'assistant', content: '', createdAt: Date.now() };
  conv.messages.push(assistant);

  const node = appendMessage(assistant, true);
  const body = $('.md', node);
  scrollToBottom(true);

  state.sending = true;
  state.abort = new AbortController();
  updateSendState();

  let text = '';
  let raf = 0;
  let last = 0;
  const paint = () => {
    body.innerHTML = renderMarkdown(text);
    maybeScroll();
  };
  const schedulePaint = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      last = performance.now();
      paint();
    });
  };

  let thinking = false;
  try {
    await streamReply(payload, conv.model, (delta) => {
      if (thinking) thinking = false;
      text += delta;
      if (performance.now() - last > 60) {
        last = performance.now();
        paint();
      } else {
        schedulePaint();
      }
    }, state.abort.signal, () => {
      // 思考模式先出一大段 reasoning，正文要等它跑完，先给个占位，别让人以为卡了
      if (thinking || text) return;
      thinking = true;
      body.innerHTML = '<div class="thinking-line">正在思考…</div>';
      maybeScroll();
    });
  } catch (err) {
    if (err.name !== 'AbortError') {
      if (/密码|401/.test(err.message || '')) {
        showLock();
      }
      const message = friendlyError(err.message);
      text = text ? `${text}\n\n> ⚠️ ${message}` : `⚠️ ${message}`;
    }
  } finally {
    if (raf) cancelAnimationFrame(raf);
    assistant.content = text;
    state.sending = false;
    state.abort = null;
    updateSendState();

    if (!text.trim()) {
      conv.messages = conv.messages.filter((m) => m.id !== assistant.id);
      node.remove();
      return;
    }

    body.innerHTML = renderMarkdown(text);
    node.querySelector('.msg-actions')?.insertAdjacentHTML(
      'beforeend',
      `<button class="msg-act" data-regen title="重新生成"><svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 3v3h-3"/></svg>重新生成</button>`,
    );
    await persist(conv);
    maybeScroll();
  }
}

/* 安卓壳回调进来的入口（Java 侧 evaluateJavascript 调这几个） */
window.__afvNativeStatus = (id, code) => window.__afvNative?.[id]?.status?.(code);
window.__afvNativeChunk = (id, text) => window.__afvNative?.[id]?.chunk?.(text);
window.__afvNativeDone = (id) => window.__afvNative?.[id]?.done?.();
window.__afvNativeError = (id, message) => window.__afvNative?.[id]?.error?.(message);

/**
 * 安卓壳里没有 CORS 这道墙：走原生 HTTP，边收边喂给 ReadableStream。
 * 普通浏览器里回到 fetch。
 */
function nativeSend(url, headers, body) {
  return new Promise((resolve, reject) => {
    const id = `r${Math.random().toString(36).slice(2)}`;
    const encoder = new TextEncoder();
    let controller = null;
    let status = 0;
    let settled = false;
    let statusResolve;
    const statusReady = new Promise((done) => {
      statusResolve = done;
    });

    const stream = new ReadableStream({
      start(c) {
        controller = c;
      },
    });

    const cleanup = () => {
      if (window.__afvNative) delete window.__afvNative[id];
    };

    window.__afvNative = window.__afvNative || {};
    window.__afvNative[id] = {
      status(code) {
        status = code;
        statusResolve(code);
      },
      chunk(text) {
        if (!controller) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          /* 流已经关了 */
        }
      },
      done() {
        if (settled) return;
        settled = true;
        statusResolve(status || 200);
        try {
          controller.close();
        } catch {
          /* 已关闭 */
        }
        cleanup();
      },
      error(message) {
        if (settled) return;
        settled = true;
        statusResolve(-1);
        try {
          controller.error(new Error(message || '原生请求失败'));
        } catch {
          /* 已关闭 */
        }
        cleanup();
      },
    };

    try {
      window.AFVNative.streamPost(id, url, JSON.stringify(headers), body);
    } catch (err) {
      window.__afvNative[id].error(err.message);
    }

    statusReady.then((code) => {
      if (code === -1) {
        reject(new Error('连不上服务器（原生请求失败）'));
        return;
      }
      resolve({
        ok: code >= 200 && code < 300,
        status: code,
        body: stream,
        async text() {
          const reader = stream.getReader();
          const decoder = new TextDecoder();
          let out = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            out += decoder.decode(value, { stream: true });
          }
          return out;
        },
        async json() {
          return JSON.parse(await this.text());
        },
      });
    });
  });
}

async function postJson(url, headers, bodyText, signal, isServer) {
  if (!isServer && window.AFVNative && typeof window.AFVNative.streamPost === 'function') {
    return nativeSend(url, headers, bodyText);
  }
  return fetch(url, { method: 'POST', headers, signal, body: bodyText });
}

async function readError(res) {
  let message = `请求失败（${res.status}）`;
  try {
    const data = await res.json();
    message = data?.error?.message || data?.message || data?.error || message;
  } catch {
    /* 非 JSON */
  }
  return message;
}

async function streamReply(messages, model, onDelta, signal, onReasoning) {
  const isServer = state.mode === 'server';
  const rt = resolveModelRuntime(model);
  const base = rt.baseUrl;
  if (!base) throw new Error('这个模型还没配 API 地址，去「设置 → 模型」里填上');

  if (!isServer && rt.protocol === 'anthropic') {
    await anthropicChat({ messages, rt, base, onDelta, onReasoning, signal });
    return;
  }

  const url = isServer ? '/api/chat' : `${base}/chat/completions`;
  const headers = { 'Content-Type': 'application/json' };
  if (isServer) {
    if (state.token) headers['x-afv-session'] = state.token;
  } else {
    headers.Authorization = `Bearer ${rt.apiKey}`;
  }

  const payload = { model: rt.upstream, messages, stream: true, temperature: 1 };
  if (isServer) {
    if (rt.apiKey) payload.apiKey = rt.apiKey;
    payload.baseUrl = base;
    payload.upstream = rt.upstream;
  }

  const res = await postJson(url, headers, JSON.stringify(payload), signal, isServer);
  if (!res.ok) throw new Error(await readError(res));
  await readStream(res.body, onDelta, onReasoning);
}

/* Anthropic 原生协议：/v1/messages + x-api-key，SSE 事件格式也不一样 */
async function anthropicChat({ messages, rt, base, onDelta, onReasoning, signal }) {
  const root = String(base).replace(/\/+$/, '');
  const url = /\/v1$/.test(root) ? `${root}/messages` : `${root}/v1/messages`;
  const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const body = { model: rt.upstream, max_tokens: 8192, messages: chatMessages, stream: true };
  if (systemParts.length) body.system = systemParts.join('\n\n');

  const res = await postJson(
    url,
    {
      'Content-Type': 'application/json',
      'x-api-key': rt.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    JSON.stringify(body),
    signal,
    false,
  );

  if (!res.ok) throw new Error(await readError(res));
  await readAnthropicStream(res.body, onDelta, onReasoning);
}

async function readAnthropicStream(body, onDelta, onReasoning) {
  if (!body) throw new Error('没有收到数据流');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        if (json.type === 'error') throw new Error(json.error?.message || '上游返回错误');
        const delta = json.delta;
        if (delta?.type === 'thinking_delta' && delta.thinking && onReasoning) onReasoning();
        if (delta?.type === 'text_delta' && delta.text) onDelta(delta.text);
      }
    }
  }
}

/* 上游的英文报错翻成人话，别让老大看天书 */
function friendlyError(raw) {
  const s = String(raw || '').trim();
  if (!s) return '请求失败，上游没给原因';
  if (/supported API model names/i.test(s)) {
    return '上游不认这个模型名。去「设置 → 模型 → 自定义设置」改「上游模型名称」，或点「测试连接」看真实名字';
  }
  if (/\b404\b|not found|Not Found/i.test(s)) {
    return 'API 地址不对（404）。检查「自定义设置 → API 地址」';
  }
  if (/Authentication|auth header|invalid[_ ]?api[_ ]?key|invalid.*key|API key/i.test(s)) {
    return 'API 密钥无效，重新填一次';
  }
  if (/insufficient|balance|quota|欠费|余额/i.test(s)) {
    return '额度不足，去对应平台充值';
  }
  if (/rate limit|too many requests|\b429\b/i.test(s)) {
    return '请求太频繁，缓一下再发';
  }
  if (/context length|too long|maximum context/i.test(s)) {
    return '内容超长了，开个新对话';
  }
  if (/Failed to fetch|NetworkError|load failed|fetch failed|ERR_NETWORK/i.test(s)) {
    return '连不上服务器。检查网络，或者「API 地址」填错了';
  }
  return s;
}

async function readStream(body, onDelta, onReasoning) {
  if (!body) throw new Error('没有收到数据流');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      for (const line of part.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        if (json.error) throw new Error(json.error.message || '上游返回错误');
        const delta = json.choices?.[0]?.delta;
        // 思考模式先吐 reasoning_content，正文要等它跑完
        const reasoning = delta?.reasoning_content;
        if (typeof reasoning === 'string' && reasoning && onReasoning) onReasoning();
        if (typeof delta?.content === 'string' && delta.content) onDelta(delta.content);
      }
    }
  }
}

function stopStreaming() {
  if (state.abort) state.abort.abort();
  state.sending = false;
  updateSendState();
}

async function persist(conv, refresh = true) {
  try {
    conv.updatedAt = Date.now();
    await state.store.save(conv);
    state.cache.set(conv.id, conv);
    if (refresh) await refreshList();
  } catch (err) {
    if (/密码|401/.test(err.message || '')) showLock();
    else toast(`保存失败：${err.message}`);
  }
}

/* ================================================================== */
/* 空态书法打字机                                                      */
/* ================================================================== */

const HEADLINE_GROUPS = [['如切如磋，如琢如磨'], ['不诱于誉，不恐于诽', '率道而行，端然正己']];
const TYPE_DELAY_MS = 105;
const DELETE_DELAY_MS = 55;
const OPEN_DELAY_MS = 320;
const SEGMENT_GAP_MS = 420;
const GROUP_GAP_MS = 640;
const GROUP_HOLD_MS = 20000;

function splitGraphemes(value) {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(value), ({ segment }) => segment);
  }
  return Array.from(value);
}

function shuffledOrder(previous, count) {
  const order = Array.from({ length: count }, (_, index) => index);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [order[index], order[target]] = [order[target], order[index]];
  }
  if (order.length > 1 && order[0] === previous) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

class HeadlineTypewriter {
  constructor(element) {
    this.el = element;
    this.timers = new Set();
    this.generation = 0;
    this.previous = -1;
    this.order = [];
    this.reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  clear() {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  schedule(fn, delay, token = this.generation) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (token === this.generation) fn();
    }, delay);
    this.timers.add(timer);
  }

  render(value) {
    if (this.el) this.el.textContent = value;
  }

  type(value, done) {
    if (this.reduced) {
      this.render(value);
      done();
      return;
    }
    const graphemes = splitGraphemes(value);
    let length = 0;
    const step = () => {
      length += 1;
      this.render(graphemes.slice(0, length).join(''));
      if (length < graphemes.length) this.schedule(step, TYPE_DELAY_MS);
      else done();
    };
    step();
  }

  erase(done) {
    if (this.reduced) {
      this.render('');
      done();
      return;
    }
    const graphemes = splitGraphemes(this.el.textContent || '');
    let length = graphemes.length;
    const step = () => {
      length -= 1;
      this.render(graphemes.slice(0, length).join(''));
      if (length > 0) this.schedule(step, DELETE_DELAY_MS);
      else done();
    };
    this.schedule(step, DELETE_DELAY_MS);
  }

  nextGroup() {
    if (!this.order.length) this.order = shuffledOrder(this.previous, HEADLINE_GROUPS.length);
    return this.order.shift() ?? 0;
  }

  playGroup() {
    const index = this.nextGroup();
    const group = HEADLINE_GROUPS[index];
    const hold = GROUP_HOLD_MS / group.length;

    const playSegment = (segmentIndex) => {
      this.type(group[segmentIndex], () => {
        this.schedule(() => {
          this.erase(() => {
            if (segmentIndex + 1 < group.length) {
              this.schedule(() => playSegment(segmentIndex + 1), SEGMENT_GAP_MS);
              return;
            }
            this.previous = index;
            this.schedule(() => this.playGroup(), GROUP_GAP_MS);
          });
        }, hold);
      });
    };
    playSegment(0);
  }

  start() {
    this.clear();
    this.generation += 1;
    this.previous = -1;
    this.order = [];
    this.render('');
    this.schedule(() => this.playGroup(), OPEN_DELAY_MS);
  }

  stop(restore) {
    this.clear();
    this.generation += 1;
    if (restore && this.el) this.el.textContent = '';
  }
}

/* ================================================================== */
/* 菜单 / 提示                                                         */
/* ================================================================== */

function closeMenu() {
  if (state.menu) {
    state.menu.remove();
    state.menu = null;
  }
}

function openMenu(anchor, items, onPick, options = {}) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = `menu${options.compact ? ' menu--compact' : ''}${options.rows ? ' menu--models' : ''}`;
  menu.innerHTML = items
    .map(
      (item) =>
        `<button class="menu-item${item.active ? ' is-active' : ''}${item.danger ? ' is-danger' : ''}" data-value="${escapeHtml(item.value)}">` +
        (item.icon
          ? `<img class="menu-icon${item.mono ? ' is-mono' : ''}" src="${escapeHtml(item.icon)}" alt="" loading="lazy" />`
          : '') +
        `<span>${escapeHtml(item.label)}</span>` +
        (item.hint ? `<em>${escapeHtml(item.hint)}</em>` : '') +
        `</button>`,
    )
    .join('');
  document.body.appendChild(menu);
  state.menu = menu;

  const rect = anchor?.getBoundingClientRect?.();
  const point = options.point;
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  const baseX = point ? point.x : rect.left;
  const baseY = point ? point.y : rect.bottom;
  let left = Math.min(baseX, window.innerWidth - width - 10);
  left = Math.max(10, left);
  let top = baseY + 6;
  if (top + height > window.innerHeight - 10) {
    top = (point ? point.y : rect.top) - height - 6;
  }
  top = Math.max(10, top);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  menu.addEventListener('click', (event) => {
    const button = event.target.closest('.menu-item');
    if (!button) return;
    onPick(button.dataset.value);
    closeMenu();
  });

  setTimeout(() => {
    document.addEventListener('click', onDocClick, { once: true });
  }, 0);

  function onDocClick(event) {
    if (state.menu && !state.menu.contains(event.target)) closeMenu();
  }
}

function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('is-on'));
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.classList.remove('is-on');
    setTimeout(() => {
      el.hidden = true;
    }, 200);
  }, 2400);
}

function showLock() {
  $('#lock').hidden = false;
  setTimeout(() => $('#lockInput').focus(), 50);
}

/* ================================================================== */
/* 版本检查                                                            */
/* ================================================================== */

/* 版本号：主版本按数字比，-rc.1 这类预发布标记算「更小」 */
function parseVersion(value) {
  const raw = String(value || '').replace(/^v/i, '').trim();
  const dash = raw.indexOf('-');
  const core = dash >= 0 ? raw.slice(0, dash) : raw;
  const pre = dash >= 0 ? raw.slice(dash + 1) : '';
  const nums = core.split('.').map((part) => Number.parseInt(part, 10) || 0);
  while (nums.length < 3) nums.push(0);
  return { nums, pre };
}

function compareVersion(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  for (let i = 0; i < Math.max(va.nums.length, vb.nums.length); i += 1) {
    const x = va.nums[i] || 0;
    const y = vb.nums[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  if (!va.pre && vb.pre) return 1;
  if (va.pre && !vb.pre) return -1;
  if (va.pre === vb.pre) return 0;
  return va.pre > vb.pre ? 1 : -1;
}

/* GitHub 只在没有预发布版时才给 /releases/latest，所以 404 时退回去拉列表 */
async function fetchLatestRelease() {
  const headers = { Accept: 'application/vnd.github+json' };
  const base = `https://api.github.com/repos/${UPDATE_REPO}`;
  const res = await fetch(`${base}/releases/latest`, { headers, cache: 'no-store' });
  if (res.ok) return res.json();
  const list = await fetch(`${base}/releases?per_page=5`, { headers, cache: 'no-store' });
  if (!list.ok) return null;
  const rows = await list.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function showUpdate(version, url) {
  $('#updateVersion').textContent = `v${APP_VERSION} → v${version}`;
  $('#updatePop').hidden = false;
  $('#updateGo').onclick = () => window.open(url, '_blank', 'noopener');
  $('#updateLater').onclick = () => {
    $('#updatePop').hidden = true;
  };
  $('#updateMask').onclick = () => {
    $('#updatePop').hidden = true;
  };
}

async function checkForUpdate(manual = false) {
  try {
    const data = await fetchLatestRelease();
    if (!data) {
      if (manual) toast('还没发布过版本');
      return;
    }
    const latest = String(data.tag_name || '').replace(/^v/i, '');
    if (latest && compareVersion(latest, APP_VERSION) > 0) {
      const apk = (data.assets || []).find((asset) => String(asset.name).toLowerCase().endsWith('.apk'));
      showUpdate(latest, apk ? apk.browser_download_url : data.html_url);
      return;
    }
    if (manual) toast('已经是最新版本');
  } catch {
    if (manual) toast('检查更新失败，网络不通或还没发布版本');
  }
}

/* ================================================================== */
/* 对话菜单 / 多选                                                      */
/* ================================================================== */

function openConvMenu(anchor, id, point) {
  const conv = state.convs.find((item) => item.id === id) || state.cache.get(id);
  if (!conv) return;
  openMenu(
    anchor,
    [
      { value: 'pin', label: conv.pinned ? '取消置顶' : '置顶' },
      { value: 'rename', label: '重命名' },
      { value: 'select', label: '多选' },
      { value: 'export', label: '导出' },
      { value: 'delete', label: '删除', danger: true },
    ],
    (value) => handleConvAction(value, conv),
    { compact: true, point },
  );
}

async function handleConvAction(value, conv) {
  if (value === 'pin') {
    conv.pinned = !conv.pinned;
    state.cache.set(conv.id, conv);
    await persist(conv);
    toast(conv.pinned ? '已置顶' : '已取消置顶');
    return;
  }
  if (value === 'rename') {
    const name = prompt('新的名字', conv.title || '');
    if (name === null) return;
    conv.title = name.trim() || '新对话';
    if (state.current?.id === conv.id) $('#chatTitle').textContent = conv.title;
    await persist(conv);
    return;
  }
  if (value === 'select') {
    enterSelectMode(conv.id);
    return;
  }
  if (value === 'export') {
    let full = state.cache.get(conv.id);
    if (!full || !Array.isArray(full.messages)) {
      try {
        full = await state.store.get(conv.id);
      } catch {
        full = conv;
      }
    }
    downloadJSON(
      { app: 'ForgeVision', exportedAt: Date.now(), conversations: [full] },
      `forgevision-${conv.id}.json`,
    );
    return;
  }
  if (value === 'delete') {
    if (!confirm(`删除「${conv.title || '未命名对话'}」？删了就找不回来了。`)) return;
    await state.store.remove(conv.id);
    state.cache.delete(conv.id);
    if (state.current?.id === conv.id) newChat();
    await refreshList();
    toast('已删除');
  }
}

function enterSelectMode(preselect) {
  state.selectMode = true;
  state.selected.clear();
  if (preselect) state.selected.add(preselect);
  renderList();
}

function exitSelectMode() {
  state.selectMode = false;
  state.selected.clear();
  renderList();
}

function toggleSelect(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  renderList();
}

async function batchExport() {
  const conversations = [];
  for (const id of [...state.selected]) {
    let full = state.cache.get(id);
    if (!full || !Array.isArray(full.messages)) {
      try {
        full = await state.store.get(id);
      } catch {
        continue;
      }
    }
    if (full) conversations.push(full);
  }
  downloadJSON(
    { app: 'ForgeVision', exportedAt: Date.now(), conversations },
    'forgevision-selected.json',
  );
  toast(`已导出 ${conversations.length} 段`);
}

async function batchDelete() {
  const ids = [...state.selected];
  if (!ids.length) return;
  if (!confirm(`删除选中的 ${ids.length} 个对话？`)) return;
  for (const id of ids) {
    await state.store.remove(id).catch(() => {});
    state.cache.delete(id);
    if (state.current?.id === id) newChat();
  }
  exitSelectMode();
  await refreshList();
  toast('已删除');
}

/* ================================================================== */
/* 外观                                                                */
/* ================================================================== */

function applyTheme() {
  const pref = state.settings.theme || 'light';
  const dark =
    pref === 'dark' ||
    (pref === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.body.dataset.theme = dark ? 'dark' : 'light';
  syncNativeChrome(dark);
}

/* 安卓壳里把状态栏 / 导航栏染成页面底色，避免白边 */
function syncNativeChrome(dark) {
  const native = window.AFVNative;
  if (!native || typeof native.setChrome !== 'function') return;
  let bg = '';
  try {
    bg = getComputedStyle(document.body).getPropertyValue('--bg').trim();
  } catch {}
  try {
    native.setChrome(Boolean(dark), bg || (dark ? '#17181c' : '#ffffff'));
  } catch {}
}

function applySkin() {
  const id = state.settings.skin || 'default';
  if (id === 'default') delete document.body.dataset.skin;
  else document.body.dataset.skin = id;
}

function applyFontSize() {
  document.documentElement.style.setProperty('--font-size-body', `${state.settings.fontSize || 16}px`);
}

function saveSettings() {
  LS.set('settings', state.settings);
}

/* ================================================================== */
/* 模型                                                                */
/* ================================================================== */

/* ---------------- 用户自己加的提供商（仿 DSH 的添加模型提供商） ---------------- */

/* 用户自己加的模型用这个中性标记 */
const PROVIDER_LOGO = 'logos/custom.svg';

const PROVIDER_CATALOG = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', protocol: 'openai' },
  { id: 'opencode', name: 'OpenCode Zen', baseUrl: 'https://opencode.ai/inference/openai/v1', protocol: 'openai' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', protocol: 'openai' },
  { id: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', protocol: 'anthropic' },
  {
    id: 'google',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    protocol: 'openai',
  },
  {
    id: 'dashscope',
    name: '阿里云百炼 Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    protocol: 'openai',
  },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', protocol: 'openai' },
  { id: 'xai', name: 'xAI Grok', baseUrl: 'https://api.x.ai/v1', protocol: 'openai' },
  { id: 'moonshot', name: 'Moonshot Kimi', baseUrl: 'https://api.moonshot.cn/v1', protocol: 'openai' },
];

function providers() {
  return Array.isArray(state.providers) ? state.providers : [];
}

function saveProviders() {
  LS.set('providers', providers());
}

function providerModelKey(providerId, modelId) {
  return `${providerId}/${modelId}`;
}

function isProviderModel(id) {
  return typeof id === 'string' && id.includes('/');
}

function findProviderModel(id) {
  if (!isProviderModel(id)) return null;
  const cut = id.indexOf('/');
  const providerId = id.slice(0, cut);
  const modelId = id.slice(cut + 1);
  const provider = providers().find((p) => p.id === providerId);
  if (!provider) return null;
  const model = (provider.models || []).find((m) => m.id === modelId);
  if (!model) return null;
  return { provider, model };
}

function allModels() {
  const list = MODELS.map((m) => ({
    id: m.id,
    label: m.label || m.id,
    logo: m.logo || '',
    mono: Boolean(m.mono),
    group: '',
  }));
  for (const provider of providers()) {
    for (const model of provider.models || []) {
      list.push({
        id: providerModelKey(provider.id, model.id),
        label: model.name || model.id,
        logo: PROVIDER_LOGO,
        mono: true,
        group: provider.name || provider.id,
      });
    }
  }
  return list;
}

/** 把「模型 id」翻译成真正要发的请求参数 */
function resolveModelRuntime(id) {
  const hit = findProviderModel(id);
  if (hit) {
    return {
      upstream: hit.model.id,
      baseUrl: String(hit.provider.baseUrl || '').replace(/\/+$/, ''),
      protocol: hit.provider.protocol === 'anthropic' ? 'anthropic' : 'openai',
      apiKey: hit.provider.apiKey || '',
      label: hit.model.name || hit.model.id,
    };
  }
  const def = MODELS.find((m) => m.id === id) || MODELS[0];
  const cfg = modelConfig(def.id);
  return {
    upstream: cfg.upstream || def.upstream,
    baseUrl: String(cfg.baseUrl || def.baseUrl || '').replace(/\/+$/, ''),
    protocol: 'openai',
    apiKey: cfg.apiKey || '',
    label: def.id,
  };
}

function currentModel() {
  const id = state.current?.model || state.settings.model || MODELS[0].id;
  return allModels().some((m) => m.id === id) ? id : MODELS[0].id;
}

function modelConfig(id) {
  return state.modelConfigs[id] || {};
}

function modelReady(id) {
  const hit = findProviderModel(id);
  if (hit) return Boolean(hit.provider.apiKey);
  if (modelConfig(id).apiKey) return true;
  // 服务端 .env 里的 key 只兜底默认模型
  if (state.mode === 'server' && state.config.apiKeyReady && id === MODELS[0].id) return true;
  return false;
}

function modelLabel(id) {
  const hit = findProviderModel(id);
  if (hit) return hit.model.name || hit.model.id;
  return MODELS.find((m) => m.id === id)?.label || id;
}

/**
 * 拿当前输入框里的值真发一次请求，看上游到底收不收、回的 model 是不是它。
 * 不写任何状态，纯探查。
 */
async function testModel(id, overrides = {}) {
  const model = MODELS.find((m) => m.id === id);
  if (!model) return { ok: false, message: '未知模型' };
  const cfg = { ...modelConfig(id), ...overrides };
  const base = String(cfg.baseUrl || model.baseUrl || '').replace(/\/+$/, '');
  const upstream = cfg.upstream || model.upstream;
  const apiKey = cfg.apiKey || '';
  if (!base) return { ok: false, message: '还没填 API 地址（自定义设置里）' };
  if (!apiKey) return { ok: false, message: '还没填 API 密钥' };

  const started = Date.now();
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: upstream,
        messages: [{ role: 'user', content: '只回复两个字：在的' }],
        max_tokens: 32,
        temperature: 0,
        stream: false,
      }),
    });
    const raw = await res.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      /* 非 JSON */
    }
    const ms = Date.now() - started;

    if (!res.ok) {
      const detail = data?.error?.message || data?.message || raw.slice(0, 160) || `HTTP ${res.status}`;
      return { ok: false, message: `${res.status} · ${friendlyError(detail)}` };
    }

    const used = data?.model || upstream;
    const answer = String(data?.choices?.[0]?.message?.content || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40);
    return {
      ok: true,
      used,
      message: `通了 · 上游回报 model=${used} · ${ms}ms · 回答：${answer || '(空)'}`,
    };
  } catch (err) {
    return { ok: false, message: friendlyError(err.message) };
  }
}

function syncModelLabels() {
  const id = currentModel();
  $('#sbModel').textContent = modelLabel(id);
  $('#setModelValue').textContent = modelLabel(state.settings.model);
}

function setModel(id) {
  state.settings.model = id;
  saveSettings();
  if (state.current) {
    state.current.model = id;
    persist(state.current, false);
  }
  syncModelLabels();
}

function pickModel(anchor) {
  const items = allModels().map((m) => ({
    value: m.id,
    label: m.label,
    hint: m.group,
    icon: m.logo,
    mono: m.mono,
    active: m.id === currentModel(),
  }));
  openMenu(
    anchor,
    items,
    (value) => {
      setModel(value);
      toast(`模型：${modelLabel(value)}`);
    },
    { rows: 4 },
  );
}

/* ================================================================== */
/* 设置页                                                              */
/* ================================================================== */

function openSettings() {
  closeDrawer();
  refreshSettingsValues();
  $('#settingsPage').hidden = false;
}

function closeSettings() {
  $('#settingsPage').hidden = true;
}

function refreshSettingsValues() {
  $('#setAccountValue').textContent = state.account ? accountName() : '未登录';
  $('#setModelValue').textContent = modelLabel(state.settings.model);
  $('#setVersionValue').textContent = `v${APP_VERSION}`;
}

function openSub(name) {
  if (!SUBTITLES_SAFE(name)) return;
  if ($('#settingsPage').hidden) openSettings();
  state.subPage = name;
  $('#subTitle').textContent = SUB_TITLES[name] || name;
  const body = $('#subBody');
  body.className = 'page-body';
  body.innerHTML = '';
  const render = SUB_RENDERERS[name];
  if (render) render(body);
  $('#subPage').hidden = false;
}

function SUBTITLES_SAFE(name) {
  return Boolean(SUB_TITLES[name]);
}

function closeSub() {
  $('#subPage').hidden = true;
  refreshSettingsValues();
}

/* ---------------- 添加模型提供商（仿 DSH） ---------------- */

function providerTabs(active) {
  return (
    `<div class="prov-tabs">` +
    `<button class="prov-tab${active === 'catalog' ? ' on' : ''}" data-tab="catalog" type="button">第三方模型提供商</button>` +
    `<button class="prov-tab${active === 'custom' ? ' on' : ''}" data-tab="custom" type="button">自定义模型 API</button>` +
    `</div>`
  );
}

function providerChips(models, attr) {
  if (!models.length) return '<span class="sub-hint">还没加模型</span>';
  return models
    .map(
      (m) =>
        `<span class="prov-chip">${escapeHtml(m.name || m.id)}<i ${attr}="${escapeHtml(m.id)}">×</i></span>`,
    )
    .join('');
}

function readCustomFields(body) {
  return {
    id: body.querySelector('#cId')?.value.trim() || '',
    name: body.querySelector('#cName')?.value.trim() || '',
    baseUrl: body.querySelector('#cBase')?.value.trim() || '',
    protocol: body.querySelector('#cProto')?.value || 'openai',
    apiKey: body.querySelector('#cKey')?.value.trim() || '',
  };
}

function renderProviderList(body) {
  const rows = providers()
    .map((provider) => {
      const models = provider.models || [];
      return (
        `<div class="prov-item" data-id="${escapeHtml(provider.id)}">` +
        `<button class="prov-head" type="button">` +
        `<span class="prov-name">${escapeHtml(provider.name || provider.id)}</span>` +
        `<span class="prov-meta">${models.length} 个模型</span>` +
        `<span class="model-edit">编辑</span>` +
        `</button>` +
        `<div class="prov-body"><div class="prov-body-inner">` +
        `<label class="sub-label">API 地址</label>` +
        `<input class="plain-input" data-pfield="baseUrl" value="${escapeHtml(provider.baseUrl || '')}" autocomplete="off" spellcheck="false" />` +
        `<label class="sub-label">API 密钥</label>` +
        `<input class="plain-input" data-pfield="apiKey" type="password" value="${escapeHtml(provider.apiKey || '')}" autocomplete="off" spellcheck="false" />` +
        `<label class="sub-label">模型</label>` +
        `<div class="prov-chips">${providerChips(models, 'data-rmodel')}</div>` +
        `<div class="prov-add-row">` +
        `<input class="plain-input" data-pnew placeholder="模型 ID，例如 gpt-5.6-luna" autocomplete="off" spellcheck="false" />` +
        `<button class="btn" type="button" data-padd>添加</button>` +
        `</div>` +
        `<div class="model-actions">` +
        `<button class="btn" type="button" data-pdel>删除提供商</button>` +
        `<button class="btn primary" type="button" data-psave>保存</button>` +
        `</div>` +
        `</div></div>` +
        `</div>`
      );
    })
    .join('');

  body.innerHTML =
    (rows || '<p class="sub-hint">还没添加过提供商。你自己加的模型会排在模型选择器最后。</p>') +
    `<button class="provider-add" type="button" id="provNew">＋ 添加模型提供商</button>`;

  body.querySelector('#provNew')?.addEventListener('click', () => {
    state.providerView = 'catalog';
    openSub('providers');
  });

  body.querySelectorAll('.prov-head').forEach((head) => {
    head.addEventListener('click', () => {
      const item = head.closest('.prov-item');
      const open = item.classList.contains('open');
      body.querySelectorAll('.prov-item.open').forEach((n) => n.classList.remove('open'));
      if (!open) item.classList.add('open');
    });
  });

  body.querySelectorAll('[data-psave]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = button.closest('.prov-item');
      const provider = providers().find((p) => p.id === item.dataset.id);
      if (!provider) return;
      provider.baseUrl = item.querySelector('[data-pfield="baseUrl"]').value.trim();
      provider.apiKey = item.querySelector('[data-pfield="apiKey"]').value.trim();
      saveProviders();
      toast('已保存');
      openSub('providers');
    });
  });

  body.querySelectorAll('[data-padd]').forEach((button) => {
    button.addEventListener('click', () => {
      const item = button.closest('.prov-item');
      const provider = providers().find((p) => p.id === item.dataset.id);
      const value = item.querySelector('[data-pnew]').value.trim();
      if (!provider || !value) return;
      provider.models = provider.models || [];
      if (provider.models.some((m) => m.id === value)) {
        toast('这个模型已经加过了');
        return;
      }
      provider.models.push({ id: value, name: value });
      saveProviders();
      openSub('providers');
      toast(`已添加 ${value}`);
    });
  });

  body.querySelectorAll('[data-rmodel]').forEach((icon) => {
    icon.addEventListener('click', (event) => {
      event.stopPropagation();
      const item = icon.closest('.prov-item');
      const provider = providers().find((p) => p.id === item.dataset.id);
      if (!provider) return;
      provider.models = (provider.models || []).filter((m) => m.id !== icon.dataset.rmodel);
      saveProviders();
      openSub('providers');
    });
  });

  body.querySelectorAll('[data-pdel]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.closest('.prov-item').dataset.id;
      state.providers = providers().filter((p) => p.id !== id);
      saveProviders();
      if (isProviderModel(state.settings.model) && state.settings.model.startsWith(`${id}/`)) {
        setModel(MODELS[0].id);
      }
      openSub('providers');
      toast('已删除');
    });
  });
}

function renderProviderForm(body, kind) {
  const draft = state.providerDraft || {};
  const draftModels = draft.models || [];

  if (kind === 'catalog') {
    body.innerHTML =
      providerTabs('catalog') +
      `<p class="sub-hint">从内置目录选提供商，填上它的 API 密钥即可。加完在列表里展开它，把要用的模型 ID 加进去。</p>` +
      `<label class="sub-label">提供商</label>` +
      `<select class="plain-input" id="provPick">` +
      PROVIDER_CATALOG.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('') +
      `</select>` +
      `<label class="sub-label">API 密钥</label>` +
      `<input class="plain-input" id="provKey" type="password" placeholder="粘贴该提供商的 API 密钥" autocomplete="off" spellcheck="false" />` +
      `<div class="model-actions">` +
      `<button class="btn" type="button" data-back>取消</button>` +
      `<button class="btn primary" type="button" data-create>添加</button>` +
      `</div>`;
  } else {
    body.innerHTML =
      providerTabs('custom') +
      `<p class="sub-hint">连接中转站、自部署服务或其他兼容 OpenAI / Anthropic 协议的接口，要填地址、协议和模型。</p>` +
      `<label class="sub-label">Provider ID</label>` +
      `<input class="plain-input" id="cId" placeholder="acme-gateway" value="${escapeHtml(draft.id || '')}" autocomplete="off" spellcheck="false" />` +
      `<p class="sub-hint">以小写字母开头的标识，在请求中唯一标识该提供商。</p>` +
      `<label class="sub-label">显示名称</label>` +
      `<input class="plain-input" id="cName" placeholder="显示名称" value="${escapeHtml(draft.name || '')}" autocomplete="off" />` +
      `<label class="sub-label">API 地址</label>` +
      `<input class="plain-input" id="cBase" placeholder="https://gateway.example/v1" value="${escapeHtml(draft.baseUrl || '')}" autocomplete="off" spellcheck="false" />` +
      `<label class="sub-label">API 协议</label>` +
      `<select class="plain-input" id="cProto">` +
      `<option value="openai"${draft.protocol === 'anthropic' ? '' : ' selected'}>OpenAI Chat Completions</option>` +
      `<option value="anthropic"${draft.protocol === 'anthropic' ? ' selected' : ''}>Anthropic Messages</option>` +
      `</select>` +
      `<label class="sub-label">API 密钥</label>` +
      `<input class="plain-input" id="cKey" type="password" placeholder="输入 API 密钥" value="${escapeHtml(draft.apiKey || '')}" autocomplete="off" spellcheck="false" />` +
      `<div class="prov-models-head"><span>模型目录</span><button class="prov-link" type="button" id="cFetch">获取可用模型</button></div>` +
      `<div class="prov-chips">${providerChips(draftModels, 'data-drm')}</div>` +
      `<div class="prov-add-row">` +
      `<input class="plain-input" id="cNewModel" placeholder="模型 ID，例如 gpt-5.6-luna" autocomplete="off" spellcheck="false" />` +
      `<button class="btn" type="button" id="cAddModel">添加</button>` +
      `</div>` +
      `<div class="prov-status" id="cStatus" hidden></div>` +
      `<div class="model-actions">` +
      `<button class="btn" type="button" data-back>取消</button>` +
      `<button class="btn primary" type="button" data-create>创建提供商</button>` +
      `</div>`;
  }

  body.querySelectorAll('.prov-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      state.providerView = tab.dataset.tab;
      openSub('providers');
    });
  });

  body.querySelectorAll('[data-back]').forEach((button) => {
    button.addEventListener('click', () => {
      state.providerView = 'list';
      state.providerDraft = null;
      openSub('providers');
    });
  });

  if (kind === 'catalog') {
    body.querySelector('[data-create]')?.addEventListener('click', () => {
      const pick = body.querySelector('#provPick').value;
      const apiKey = body.querySelector('#provKey').value.trim();
      const item = PROVIDER_CATALOG.find((p) => p.id === pick);
      if (!item) return;
      if (!apiKey) {
        toast('先填 API 密钥');
        return;
      }
      if (providers().some((p) => p.id === item.id)) {
        toast('这个提供商已经加过了');
        return;
      }
      state.providers = providers().concat([
        {
          id: item.id,
          name: item.name,
          baseUrl: item.baseUrl,
          protocol: item.protocol,
          apiKey,
          models: [],
        },
      ]);
      saveProviders();
      state.providerView = 'list';
      openSub('providers');
      toast(`已添加 ${item.name}，展开它加模型`);
    });
    return;
  }

  const remember = (patch) => {
    state.providerDraft = { ...readCustomFields(body), models: draftModels, ...patch };
    openSub('providers');
  };

  body.querySelector('#cAddModel')?.addEventListener('click', () => {
    const value = body.querySelector('#cNewModel').value.trim();
    if (!value) return;
    if (draftModels.some((m) => m.id === value)) return;
    remember({ models: draftModels.concat([{ id: value, name: value }]) });
  });

  body.querySelectorAll('[data-drm]').forEach((icon) => {
    icon.addEventListener('click', () => {
      remember({ models: draftModels.filter((m) => m.id !== icon.dataset.drm) });
    });
  });

  body.querySelector('#cFetch')?.addEventListener('click', async () => {
    const fields = readCustomFields(body);
    const status = body.querySelector('#cStatus');
    if (!fields.baseUrl) {
      toast('先填 API 地址');
      return;
    }
    status.hidden = false;
    status.className = 'prov-status';
    status.textContent = '正在拉模型列表…';
    try {
      const headers = {};
      if (fields.apiKey) {
        if (fields.protocol === 'anthropic') headers['x-api-key'] = fields.apiKey;
        else headers.Authorization = `Bearer ${fields.apiKey}`;
      }
      if (fields.protocol === 'anthropic') headers['anthropic-version'] = '2023-06-01';
      const res = await fetch(`${fields.baseUrl.replace(/\/+$/, '')}/models`, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      const models = rows.map((row) => ({ id: row.id, name: row.name || row.id })).filter((m) => m.id);
      if (!models.length) throw new Error('返回里没有模型');
      state.providerDraft = { ...fields, models };
      openSub('providers');
      toast(`拉到 ${models.length} 个模型`);
    } catch (err) {
      status.className = 'prov-status fail';
      status.textContent = friendlyError(err.message);
    }
  });

  body.querySelector('[data-create]')?.addEventListener('click', () => {
    const fields = readCustomFields(body);
    const models = state.providerDraft?.models || [];
    if (!/^[a-z0-9][a-z0-9-]*$/.test(fields.id)) {
      toast('Provider ID 要小写字母或数字开头，只能含小写字母、数字、-');
      return;
    }
    if (!fields.baseUrl) {
      toast('先填 API 地址');
      return;
    }
    if (!models.length) {
      toast('至少加一个模型');
      return;
    }
    if (providers().some((p) => p.id === fields.id)) {
      toast('这个 Provider ID 已经用了');
      return;
    }
    state.providers = providers().concat([
      {
        id: fields.id,
        name: fields.name || fields.id,
        baseUrl: fields.baseUrl,
        protocol: fields.protocol,
        apiKey: fields.apiKey,
        models,
      },
    ]);
    saveProviders();
    state.providerDraft = null;
    state.providerView = 'list';
    openSub('providers');
    toast(`已创建 ${fields.name || fields.id}`);
  });
}

const SUB_RENDERERS = {
  account(body) {
    const phone = state.account?.phone || '';
    const email = state.account?.email || '';
    const avatar =
      '<svg viewBox="0 0 40 40">' +
      '<rect x="0.5" y="0.5" width="39" height="39" fill="#ffffff" stroke="#d8dbe0" />' +
      '<rect x="6" y="6" width="28" height="28" fill="#f1f2f4" />' +
      '<rect x="17" y="11.5" width="6" height="6" fill="#5b6b86" />' +
      '<path d="M12 29v-4a8 8 0 0 1 16 0v4" fill="none" stroke="#5b6b86" stroke-width="2.6" stroke-linecap="round" />' +
      '</svg>';
    const mailIcon =
      '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" /><path d="m3.5 6 8.5 7 8.5-7" /></svg>';
    const phoneIcon =
      '<svg viewBox="0 0 24 24"><path d="M6 3.5h3l1.8 4.5-2.2 1.8a12 12 0 0 0 5.6 5.6l1.8-2.2 4.5 1.8v3a1.5 1.5 0 0 1-1.6 1.5A17.5 17.5 0 0 1 4.5 5.1 1.5 1.5 0 0 1 6 3.5z" /></svg>';
    const mobileIcon =
      '<svg viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" /><path d="M10.5 18.5h3" /></svg>';

    body.innerHTML =
      `<div class="set-group" style="margin-top:8px">` +
      `<div class="set-item avatar-row"><span class="set-icon">${avatar}</span></div>` +
      `<button class="set-item" data-bind="email">` +
      `<span class="set-icon">${mailIcon}</span><span class="set-label">邮箱</span>` +
      `<i>${email ? maskEmail(email) : '未绑定'}</i><span class="chev">›</span>` +
      `</button>` +
      `<button class="set-item" data-bind="phone">` +
      `<span class="set-icon">${phoneIcon}</span><span class="set-label">手机号</span>` +
      `<i>${phone ? maskPhone(phone) : '未绑定'}</i><span class="chev">›</span>` +
      `</button>` +
      `</div>` +
      `<div class="set-section-title" style="margin-top:18px">安全</div>` +
      `<div class="set-group">` +
      `<button class="set-item" data-device>` +
      `<span class="set-icon">${mobileIcon}</span><span class="set-label">登录设备管理</span><span class="chev">›</span>` +
      `</button>` +
      `</div>`;
  },

  models(body) {
    body.innerHTML =
      `<button class="provider-add" id="addProviderBtn" type="button">＋ 添加模型提供商</button>` +
      `<div class="model-tip">给每个模型填上自己的 API 密钥，填完就能用；没填的不能发消息。</div>` +
      `<div class="model-list">` +
      MODELS.map((model) => {
        const cfg = modelConfig(model.id);
        const ready = modelReady(model.id);
        return (
          `<div class="model-item" data-id="${escapeHtml(model.id)}">` +
          `<button class="model-head" type="button">` +
          `<span class="model-name">${escapeHtml(model.label || model.id)}</span>` +
          `<span class="model-dot${ready ? ' on' : ''}"></span>` +
          `<span class="model-edit">编辑</span>` +
          `</button>` +
          `<div class="model-body"><div class="model-body-inner">` +
          `<label class="sub-label">API 密钥</label>` +
          `<input class="plain-input" data-field="apiKey" type="password" placeholder="留空使用已保存的凭据" value="${escapeHtml(cfg.apiKey || '')}" autocomplete="off" spellcheck="false" />` +
          `<button class="model-custom-toggle" type="button">自定义设置</button>` +
          `<div class="model-custom" hidden>` +
          `<label class="sub-label">API 地址</label>` +
          `<input class="plain-input" data-field="baseUrl" placeholder="${escapeHtml(model.baseUrl || '这个模型需要你自己填地址')}" value="${escapeHtml(cfg.baseUrl || '')}" autocomplete="off" spellcheck="false" />` +
          `<label class="sub-label">上游模型名称</label>` +
          `<input class="plain-input" data-field="upstream" placeholder="${escapeHtml(model.upstream)}" value="${escapeHtml(cfg.upstream || '')}" autocomplete="off" spellcheck="false" />` +
          `<p class="model-hint">现在会请求 ${escapeHtml(
            String(cfg.baseUrl || model.baseUrl || '（没配地址）').replace(/\/+$/, ''),
          )}/chat/completions，model=<b>${escapeHtml(cfg.upstream || model.upstream)}</b></p>` +
          `</div>` +
          `<div class="model-test-out" hidden></div>` +
          `<div class="model-actions">` +
          `<button class="btn" type="button" data-act="test">测试连接</button>` +
          `<button class="btn" type="button" data-act="cancel">取消</button>` +
          `<button class="btn primary" type="button" data-act="save">保存</button>` +
          `</div>` +
          `</div></div>` +
          `</div>`
        );
      }).join('') +
      `</div>`;

    body.querySelector('#addProviderBtn')?.addEventListener('click', () => {
      state.providerView = 'list';
      openSub('providers');
    });

    body.querySelectorAll('.model-head').forEach((head) => {
      head.addEventListener('click', () => {
        const item = head.closest('.model-item');
        const isOpen = item.classList.contains('open');
        body.querySelectorAll('.model-item.open').forEach((node) => node.classList.remove('open'));
        if (!isOpen) item.classList.add('open');
      });
    });

    body.querySelectorAll('.model-custom-toggle').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const custom = toggle.nextElementSibling;
        custom.hidden = !custom.hidden;
        toggle.classList.toggle('open', !custom.hidden);
      });
    });

    body.querySelectorAll('[data-act="cancel"]').forEach((button) => {
      button.addEventListener('click', () => button.closest('.model-item').classList.remove('open'));
    });

    body.querySelectorAll('[data-act="test"]').forEach((button) => {
      button.addEventListener('click', async () => {
        const item = button.closest('.model-item');
        const out = item.querySelector('.model-test-out');
        const apiKey = item.querySelector('[data-field="apiKey"]').value.trim();
        const baseUrl = item.querySelector('[data-field="baseUrl"]').value.trim();
        const upstream = item.querySelector('[data-field="upstream"]').value.trim();
        out.hidden = false;
        out.className = 'model-test-out';
        out.textContent = '正在请求上游…';
        button.disabled = true;
        const result = await testModel(item.dataset.id, { apiKey, baseUrl, upstream });
        button.disabled = false;
        out.className = `model-test-out ${result.ok ? 'ok' : 'fail'}`;
        out.textContent = result.message;
      });
    });

    body.querySelectorAll('[data-act="save"]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = button.closest('.model-item');
        const id = item.dataset.id;
        const apiKey = item.querySelector('[data-field="apiKey"]').value.trim();
        const baseUrl = item.querySelector('[data-field="baseUrl"]').value.trim();
        const upstream = item.querySelector('[data-field="upstream"]').value.trim();
        const cfg = {};
        if (apiKey) cfg.apiKey = apiKey;
        if (baseUrl) cfg.baseUrl = baseUrl;
        if (upstream) cfg.upstream = upstream;
        state.modelConfigs[id] = cfg;
        LS.set('modelConfigs', state.modelConfigs);
        openSub('models');
        toast(apiKey || cfg.baseUrl || cfg.upstream ? '已保存' : '已清空');
      });
    });
  },

  providers(body) {
    const view = state.providerView || 'list';
    if (view === 'catalog' || view === 'custom') renderProviderForm(body, view);
    else renderProviderList(body);
  },

  data(body) {
    const isServer = state.mode === 'server';
    body.innerHTML =
      `<div class="sub-block">` +
      `<label class="sub-label">存储</label>` +
      `<p class="sub-hint">${
        isServer
          ? '对话保存在这台电脑的项目 data/ 目录，每天自动留一份备份，保留 14 天。'
          : '对话保存在当前浏览器（IndexedDB）。清理浏览器数据会一起清掉，记得导出备份。'
      }</p>` +
      `</div>` +
      `<div class="set-group">` +
      `<button class="set-item" id="exportBtn"><span class="set-label">导出全部对话</span><span class="chev">›</span></button>` +
      `<button class="set-item" id="importBtn"><span class="set-label">导入备份</span><span class="chev">›</span></button>` +
      `<button class="set-item" id="clearBtn"><span class="set-label danger">清空本机对话</span><span class="chev">›</span></button>` +
      `</div>` +
      (isServer
        ? ''
        : `<div class="sub-block"><label class="sub-label">API Key</label>` +
          `<input class="plain-input" id="setKey" type="password" placeholder="sk-…" autocomplete="off" spellcheck="false" value="${escapeHtml(
            state.settings.apiKey || '',
          )}" />` +
          `<p class="sub-hint">只保存在这台设备，不会上传到任何地方。</p></div>`) +
      `<div class="sub-block"><p class="sub-hint" id="setStoreHint"></p></div>`;
    $('#exportBtn')?.addEventListener('click', exportAll);
    $('#importBtn')?.addEventListener('click', () => {
      state.pickerMode = 'import';
      const picker = $('#filePicker');
      picker.accept = '.json,application/json';
      picker.click();
    });
    $('#clearBtn')?.addEventListener('click', clearAll);
    $('#setKey')?.addEventListener('change', (event) => {
      state.settings.apiKey = event.target.value.trim();
      saveSettings();
      toast('已保存');
    });
  },

  language(body) {
    body.innerHTML =
      `<div class="sub-block"><div class="seg">` +
      `<button aria-pressed="true">简体中文</button>` +
      `<button aria-pressed="false">English（暂未支持）</button>` +
      `</div><p class="sub-hint">目前只有简体中文。</p></div>`;
  },

  appearance(body) {
    const theme = state.settings.theme || 'light';
    const skin = state.settings.skin || 'default';
    const downloaded = Array.isArray(state.downloadedSkins) ? state.downloadedSkins : [];
    const dlBlock = downloaded.length
      ? `<div class="skin-dl-list">` +
        downloaded
          .map(
            (item) =>
              `<button class="skin-dl-item${skin === item.id ? ' is-on' : ''}" data-dl-skin="${escapeHtml(item.id)}">` +
              `<span class="skin-dl-name">${escapeHtml(item.name)}</span>` +
              `<span class="skin-dl-mark"></span>` +
              `</button>`,
          )
          .join('') +
        `</div>`
      : `<p class="skin-dl-empty">还没有下载过皮肤</p>`;

    body.innerHTML =
      `<div class="ap-top">` +
      `<button class="ap-sys${theme === 'auto' ? ' is-on' : ''}" data-ap-theme="auto">系统</button>` +
      `<div class="ap-mode">` +
      `<button data-ap-theme="light" class="${theme === 'light' ? 'is-on' : ''}">浅色</button>` +
      `<button data-ap-theme="dark" class="${theme === 'dark' ? 'is-on' : ''}">深色</button>` +
      `</div>` +
      `</div>` +
      `<div class="ap-hr"></div>` +
      `<div class="skin-grid">` +
      SKINS.map(
        (item) =>
          `<button class="skin-card${skin === item.id ? ' is-on' : ''}" data-skin-id="${item.id}">` +
          `<span class="skin-name">${item.name}</span>` +
          `<span class="skin-dots">${item.colors.map((color) => `<i style="background:${color}"></i>`).join('')}</span>` +
          `</button>`,
      ).join('') +
      `</div>` +
      `<div class="ap-hr"></div>` +
      dlBlock +
      `<div class="ap-hr"></div>` +
      `<button class="ap-link" data-open-sub="skins"><span class="set-label">下载更多皮肤</span><span class="chev">›</span></button>`;

    body.querySelectorAll('[data-ap-theme]').forEach((button) => {
      button.addEventListener('click', () => {
        state.settings.theme = button.dataset.apTheme;
        saveSettings();
        applyTheme();
        openSub('appearance');
      });
    });
    body.querySelectorAll('[data-skin-id]').forEach((button) => {
      button.addEventListener('click', () => {
        state.settings.skin = button.dataset.skinId;
        saveSettings();
        applySkin();
        openSub('appearance');
      });
    });
    body.querySelectorAll('[data-dl-skin]').forEach((button) => {
      button.addEventListener('click', () => {
        state.settings.skin = button.dataset.dlSkin;
        saveSettings();
        applySkin();
        openSub('appearance');
      });
    });
    body.querySelector('[data-open-sub]')?.addEventListener('click', () => openSub('skins'));
  },

  skins(body) {
    body.innerHTML =
      `<div class="skin-dl-hr"></div>` +
      `<div class="skin-dl-form">` +
      `<input id="skinUrl" placeholder="https://github.com/用户/仓库" autocomplete="off" spellcheck="false" />` +
      `<button id="skinFetch">下载</button>` +
      `</div>` +
      `<div class="sub-block"><p class="sub-hint">粘贴 GitHub 上的皮肤地址，下载完成后会出现在外观页的皮肤列表里。</p></div>`;
    $('#skinFetch')?.addEventListener('click', () => {
      const url = $('#skinUrl').value.trim();
      if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+/i.test(url)) {
        toast('先填一个 GitHub 仓库地址');
        return;
      }
      toast('下载功能还没接上，先记下这个地址');
    });
  },

  font(body) {
    body.classList.add('sub-font');
    const follow = Boolean(state.settings.followSystem);
    const size = state.settings.fontSize || 16;
    body.innerHTML =
      `<div class="font-preview">` +
      `<div class="font-bubble">预览文字大小</div>` +
      `<p class="font-note">你可以拖动滑块来调整字体大小。</p>` +
      `<p class="font-note">如果在使用过程中存在问题或建议，可反馈给 ForgeVision 团队。</p>` +
      `</div>` +
      `<div class="font-panel">` +
      `<div class="font-row"><span>跟随系统</span>` +
      `<button class="switch" id="followSys" aria-pressed="${follow}" aria-label="跟随系统"></button></div>` +
      `<div class="font-scale"><span class="a-small">A</span><span class="std" id="fontStd">标准</span><span class="a-big">A</span></div>` +
      `<input type="range" id="fontRange" min="14" max="20" step="1" value="${size}"${follow ? ' disabled' : ''} />` +
      `<div class="font-ticks"></div>` +
      `</div>`;

    $('#fontRange')?.addEventListener('input', (event) => {
      state.settings.fontSize = Number(event.target.value);
      saveSettings();
      applyFontSize();
    });
    $('#fontStd')?.addEventListener('click', () => {
      state.settings.fontSize = 16;
      saveSettings();
      applyFontSize();
      $('#fontRange').value = '16';
    });
    $('#followSys')?.addEventListener('click', () => {
      state.settings.followSystem = !state.settings.followSystem;
      saveSettings();
      if (state.settings.followSystem) toast('已开启跟随系统（网页版仍按当前大小显示）');
      openSub('font');
    });
  },

  terms(body) {
    body.innerHTML =
      `<div class="sub-block"><p class="sub-title-sm">用户协议与隐私政策</p>` +
      `<p class="sub-hint">这里还空着，等正式发布前补上。当前版本所有对话只存在你自己的设备里。` +
      `</p></div>`;
  },

  help(body) {
    body.innerHTML =
      `<div class="sub-block"><p class="sub-title-sm">帮助与反馈</p>` +
      `<p class="sub-hint">遇到问题先看项目里的 README，或者在仓库里开个 issue。` +
      `</p></div>`;
  },

  update(body) {
    body.innerHTML =
      `<div class="set-group">` +
      `<div class="set-item"><span class="set-label">当前版本</span><i>v${APP_VERSION}</i></div>` +
      `<button class="set-item" id="checkUpdateBtn"><span class="set-label">检查更新</span><span class="chev">›</span></button>` +
      `</div><div class="sub-block"><p class="sub-hint">打开软件时会自动检查一次版本；也可以点上面的「检查更新」手动查。有新版本会弹出提示，点更新跳到 GitHub 下载 apk。</p></div>`;
    $('#checkUpdateBtn')?.addEventListener('click', () => checkForUpdate(true));
  },
};

/* ================================================================== */
/* 语言选择面板                                                        */
/* ================================================================== */

const LANGUAGES = [
  { id: 'system', label: '系统' },
  { id: 'zh', label: '简体中文' },
  { id: 'en', label: '英文' },
  { id: 'ru', label: '俄文' },
  { id: 'ja', label: '日文' },
];

let pendingLanguage = 'system';

function renderLangOptions() {
  $('#langList').innerHTML = LANGUAGES.map(
    (item) =>
      `<button class="sheet-option" data-lang="${item.id}" aria-pressed="${pendingLanguage === item.id}">` +
      `<span class="radio"></span><span>${item.label}</span></button>`,
  ).join('');
}

function openLangSheet() {
  pendingLanguage = state.settings.language || 'system';
  renderLangOptions();
  $('#langSheet').hidden = false;
}

function closeLangSheet() {
  $('#langSheet').hidden = true;
}

/* ================================================================== */
/* 登录                                                                */
/* ================================================================== */

function openLogin(options = {}) {
  const { mode = 'login', channel = 'phone' } = options;
  state.login.mode = mode;
  state.login.channel = channel;
  state.login.code = '';
  clearInterval(state.login.timer);

  $('#loginPageTitle').textContent = mode === 'bind' ? `绑定${channel === 'phone' ? '手机号' : '邮箱'}` : '登录';
  $('#loginHeading').textContent = mode === 'bind' ? `绑定${channel === 'phone' ? '手机号' : '邮箱'}` : '登录 ForgeVision';
  $('#loginSub').textContent =
    mode === 'bind'
      ? '绑定后可以用它登录同一个账户；不绑定也不影响使用。'
      : '手机号或邮箱都可以，登录只用来区分账户，对话仍然只存在这台设备。';

  $('#loginTabs').style.display = mode === 'bind' ? 'none' : 'flex';
  setLoginChannel(channel);

  $('#loginPhone').value = '';
  $('#loginEmail').value = '';
  $('#loginCode').value = '';
  $('#loginHint').hidden = true;
  $('#agreeBox').checked = false;
  $('#sendCodeBtn').disabled = false;
  $('#sendCodeBtn').textContent = '获取验证码';
  $('#loginSubmit').textContent = mode === 'bind' ? '确认绑定' : '登录';
  $('#loginSubmit').disabled = true;

  $('#loginPage').hidden = false;
  setTimeout(() => (channel === 'phone' ? $('#loginPhone') : $('#loginEmail')).focus(), 80);
}

function closeLogin() {
  clearInterval(state.login.timer);
  $('#loginPage').hidden = true;
}

function setLoginChannel(channel) {
  state.login.channel = channel;
  $('#loginTabs').querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.channel === channel));
  });
  $('#phoneField').hidden = channel !== 'phone';
  $('#emailField').hidden = channel !== 'email';
  $('#loginHint').hidden = true;
  validateLogin();
}

function loginIdentifier() {
  return state.login.channel === 'phone'
    ? $('#loginPhone').value.trim()
    : $('#loginEmail').value.trim();
}

function validIdentifier(value) {
  if (state.login.channel === 'phone') return /^1[3-9]\d{9}$/.test(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function validateLogin() {
  const idOk = validIdentifier(loginIdentifier());
  const codeOk = $('#loginCode').value.trim().length === 6;
  const agreed = $('#agreeBox').checked;
  $('#loginSubmit').disabled = !(idOk && codeOk && agreed);
}

function sendCode() {
  const value = loginIdentifier();
  if (!validIdentifier(value)) {
    toast(state.login.channel === 'phone' ? '手机号不对' : '邮箱格式不对');
    return;
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  state.login.code = code;
  const hint = $('#loginHint');
  hint.textContent = `演示验证码：${code}（本机不发送短信/邮件）`;
  hint.hidden = false;

  const button = $('#sendCodeBtn');
  let left = 60;
  button.disabled = true;
  button.textContent = `${left}s`;
  clearInterval(state.login.timer);
  state.login.timer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(state.login.timer);
      button.disabled = false;
      button.textContent = '重新获取';
      return;
    }
    button.textContent = `${left}s`;
  }, 1000);
}

function submitLogin() {
  const value = loginIdentifier();
  if (!validIdentifier(value)) {
    toast(state.login.channel === 'phone' ? '手机号不对' : '邮箱格式不对');
    return;
  }
  if ($('#loginCode').value.trim() !== state.login.code) {
    toast('验证码不对');
    return;
  }
  if (!$('#agreeBox').checked) {
    toast('先勾选同意用户协议');
    return;
  }

  const channel = state.login.channel;
  if (state.login.mode === 'bind') {
    if (!state.account) state.account = { createdAt: Date.now() };
    state.account[channel] = value;
    if (!state.account.nickname) {
      state.account.nickname = channel === 'phone' ? `用户${value.slice(-4)}` : value.split('@')[0];
    }
    saveAccount();
    toast(channel === 'phone' ? '手机号已绑定' : '邮箱已绑定');
  } else {
    state.account = {
      phone: channel === 'phone' ? value : state.account?.phone || null,
      email: channel === 'email' ? value : state.account?.email || null,
      nickname: channel === 'phone' ? `用户${value.slice(-4)}` : value.split('@')[0],
      createdAt: state.account?.createdAt || Date.now(),
    };
    saveAccount();
    toast('登录成功');
  }

  closeLogin();
  if (state.subPage === 'account') openSub('account');
  refreshSettingsValues();
}

/* ================================================================== */
/* 数据                                                                */
/* ================================================================== */

async function exportAll() {
  try {
    const data = await state.store.exportAll();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJSON(data, `forgevision-${stamp}.json`);
    toast('已导出');
  } catch (err) {
    toast(`导出失败：${err.message}`);
  }
}

async function clearAll() {
  if (!confirm('清空这台设备上的全部对话？建议先导出备份。')) return;
  for (const conv of state.convs) {
    await state.store.remove(conv.id).catch(() => {});
  }
  state.cache.clear();
  newChat();
  await refreshList();
  toast('已清空');
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ================================================================== */
/* 布局                                                                */
/* ================================================================== */

function isNarrow() {
  return window.innerWidth <= 880;
}

function openDrawer() {
  document.body.dataset.drawer = 'open';
  $('#scrim').hidden = false;
}

function closeDrawer() {
  if (document.body.dataset.drawer === 'open') {
    delete document.body.dataset.drawer;
    $('#scrim').hidden = true;
  }
}

function toggleSidebar() {
  if (isNarrow()) {
    if (document.body.dataset.drawer === 'open') closeDrawer();
    else openDrawer();
    return;
  }
  const collapsed = document.body.dataset.sidebar === 'collapsed';
  if (collapsed) delete document.body.dataset.sidebar;
  else document.body.dataset.sidebar = 'collapsed';
}

/* ================================================================== */
/* 输入框                                                              */
/* ================================================================== */

function autoGrow() {
  const input = $('#input');
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
  updateSendState();
}

function updateSendState() {
  const hasText = $('#input').value.trim().length > 0;
  $('#sendBtn').disabled = !hasText || state.sending;
  $('#stopBtn').hidden = !state.sending;
  $('#sendBtn').hidden = state.sending;
}

function syncSearchButton() {
  const on = Boolean(state.settings.webSearch);
  $('#webSearchBtn').setAttribute('aria-pressed', String(on));
  $('#webSearchBtn').title = on ? '联网搜索：开' : '联网搜索：关';
}

function scrollToBottom() {
  const scroller = $('#chatScroll');
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
}

function maybeScroll() {
  const scroller = $('#chatScroll');
  const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
  if (gap < 160) scroller.scrollTop = scroller.scrollHeight;
}

/* ================================================================== */
/* 事件                                                                */
/* ================================================================== */

function bindUI() {
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    if (action) {
      const name = action.dataset.action;
      if (name === 'new-chat') newChat(true);
      else if (name === 'close-sidebar') isNarrow() ? closeDrawer() : toggleSidebar();
    }

    const codeButton = event.target.closest('.code-copy');
    if (codeButton) {
      const code = codeButton.closest('pre')?.querySelector('code');
      if (code) {
        navigator.clipboard.writeText(code.innerText).then(() => {
          codeButton.textContent = '已复制';
          setTimeout(() => {
            codeButton.textContent = '复制';
          }, 1200);
        });
      }
    }

    const copyButton = event.target.closest('[data-copy]');
    if (copyButton) {
      const article = copyButton.closest('.msg');
      const text = article?.querySelector('.md')?.innerText || article?.querySelector('.bubble')?.innerText || '';
      navigator.clipboard.writeText(text).then(() => toast('已复制'));
    }

    const regenButton = event.target.closest('[data-regen]');
    if (regenButton && state.current && !state.sending) regenerate();
  });

  $('#menuBtn').addEventListener('click', toggleSidebar);
  $('#scrim').addEventListener('click', closeDrawer);

  $('#sendBtn').addEventListener('click', sendMessage);
  $('#stopBtn').addEventListener('click', stopStreaming);

  $('#input').addEventListener('input', autoGrow);
  $('#input').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    if (event.isComposing) return;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (event.shiftKey || coarse) return;
    event.preventDefault();
    sendMessage();
  });

  $('#webSearchBtn').addEventListener('click', () => {
    state.settings.webSearch = !state.settings.webSearch;
    saveSettings();
    syncSearchButton();
    toast(state.settings.webSearch ? '联网搜索已开启' : '联网搜索已关闭');
  });

  $('#sessionList').addEventListener('click', async (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    const item = event.target.closest('.sb-item');

    if (state.selectMode) {
      if (item) toggleSelect(item.dataset.id);
      return;
    }

    const del = event.target.closest('[data-del]');
    if (del) {
      event.stopPropagation();
      const id = del.dataset.del;
      if (!confirm('删除这个对话？删了就找不回来了。')) return;
      try {
        await state.store.remove(id);
        state.cache.delete(id);
        if (state.current?.id === id) newChat();
        await refreshList();
        toast('已删除');
      } catch (err) {
        toast(`删除失败：${err.message}`);
      }
      return;
    }
    if (item) openConversation(item.dataset.id);
  });

  $('#sessionList').addEventListener('contextmenu', (event) => {
    const item = event.target.closest('.sb-item');
    if (!item) return;
    event.preventDefault();
    openConvMenu(item, item.dataset.id, { x: event.clientX, y: event.clientY });
  });

  $('#sessionList').addEventListener(
    'touchstart',
    (event) => {
      const item = event.target.closest('.sb-item');
      if (!item) return;
      const touch = event.touches?.[0];
      const point = touch ? { x: touch.clientX, y: touch.clientY } : null;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        suppressClick = true;
        // 只吞掉长按后紧跟着的那一次 click，别影响之后的点击
        setTimeout(() => {
          suppressClick = false;
        }, 600);
        openConvMenu(item, item.dataset.id, point);
      }, 520);
    },
    { passive: true },
  );
  ['touchend', 'touchmove', 'touchcancel'].forEach((type) => {
    $('#sessionList').addEventListener(type, () => clearTimeout(pressTimer), { passive: true });
  });

  $('#sessHead').addEventListener('click', (event) => {
    const button = event.target.closest('[data-sel]');
    if (!button) return;
    const action = button.dataset.sel;
    if (action === 'cancel') exitSelectMode();
    else if (action === 'export') batchExport();
    else if (action === 'delete') batchDelete();
  });

  $('#sessionList').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const item = event.target.closest('.sb-item');
    if (item) openConversation(item.dataset.id);
  });

  $('#sbModelRow').addEventListener('click', (event) => {
    event.stopPropagation();
    pickModel(event.currentTarget);
  });

  $('#userRow').addEventListener('click', openSettings);

  $('#moreBtn').addEventListener('click', (event) => {
    event.stopPropagation();
    openMenu(
      event.currentTarget,
      [
        { value: 'rename', label: '重命名对话' },
        { value: 'export', label: '导出这段对话' },
        { value: 'delete', label: '删除对话' },
      ],
      async (value) => {
        if (!state.current) return;
        if (value === 'rename') {
          const name = prompt('新的名字', state.current.title || '');
          if (name === null) return;
          state.current.title = name.trim() || '新对话';
          $('#chatTitle').textContent = state.current.title;
          await persist(state.current);
        } else if (value === 'export') {
          downloadJSON(
            { app: 'ForgeVision', exportedAt: Date.now(), conversations: [state.current] },
            `forgevision-${state.current.id}.json`,
          );
        } else if (value === 'delete') {
          if (!confirm('删除这个对话？')) return;
          await state.store.remove(state.current.id);
          state.cache.delete(state.current.id);
          newChat();
          await refreshList();
        }
      },
    );
  });

  $('#settingsBack').addEventListener('click', closeSettings);
  $('#settingsPage').addEventListener('click', (event) => {
    const item = event.target.closest('[data-open]');
    if (!item) return;
    if (item.dataset.open === 'language') openLangSheet();
    else openSub(item.dataset.open);
  });

  $('#langList').addEventListener('click', (event) => {
    const option = event.target.closest('[data-lang]');
    if (!option) return;
    pendingLanguage = option.dataset.lang;
    renderLangOptions();
  });
  $('#langConfirm').addEventListener('click', () => {
    state.settings.language = pendingLanguage;
    saveSettings();
    closeLangSheet();
    toast('语言已保存');
  });
  $('#langMask').addEventListener('click', closeLangSheet);

  $('#logoutBtn').addEventListener('click', () => {
    if (!state.account) {
      toast('还没有登录');
      return;
    }
    if (!confirm('退出登录？本机对话不会删除。')) return;
    state.account = null;
    LS.set('account', null);
    updateAccountUI();
    refreshSettingsValues();
    toast('已退出登录');
  });

  $('#subBack').addEventListener('click', closeSub);
  $('#subBody').addEventListener('click', (event) => {
    const bindBtn = event.target.closest('[data-bind]');
    if (bindBtn) {
      const channel = bindBtn.dataset.bind;
      const bound = channel === 'phone' ? state.account?.phone : state.account?.email;
      if (bound) {
        toast(`已绑定 ${channel === 'phone' ? maskPhone(bound) : bound}`);
        return;
      }
      openLogin({ mode: state.account ? 'bind' : 'login', channel });
      return;
    }

    const deviceBtn = event.target.closest('[data-device]');
    if (deviceBtn) {
      toast('当前只有这一台设备');
      return;
    }
  });

  $('#loginBack').addEventListener('click', closeLogin);
  $('#loginTabs').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-channel]');
    if (button) setLoginChannel(button.dataset.channel);
  });
  $('#sendCodeBtn').addEventListener('click', sendCode);
  $('#loginSubmit').addEventListener('click', submitLogin);
  $('#agreeBox').addEventListener('change', validateLogin);
  ['#loginPhone', '#loginEmail', '#loginCode'].forEach((selector) => {
    $(selector).addEventListener('input', validateLogin);
  });

  $('#lockBtn').addEventListener('click', unlock);
  $('#lockInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') unlock();
  });

  $('#filePicker').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (state.pickerMode === 'import') {
      try {
        const data = JSON.parse(await file.text());
        const result = await state.store.importAll(data);
        await refreshList();
        toast(`导入完成，共 ${result.saved ?? ''} 段`);
      } catch (err) {
        toast(`导入失败：${err.message}`);
      }
      return;
    }
    if (file.size > 400 * 1024) {
      toast('文件太大了，挑 400KB 以内的文本');
      return;
    }
    const text = await file.text();
    const input = $('#input');
    input.value += `${input.value ? '\n\n' : ''}[文件：${file.name}]\n\`\`\`\n${text.slice(0, 200000)}\n\`\`\`\n`;
    autoGrow();
    input.focus();
  });

  $('#attachBtn').addEventListener('click', () => {
    state.pickerMode = 'attach';
    const picker = $('#filePicker');
    picker.accept = '.txt,.md,.json,.csv,.log,.js,.ts,.py,.html,.css';
    picker.click();
  });

  window.addEventListener('resize', () => {
    closeMenu();
    if (!isNarrow()) closeDrawer();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeMenu();
    if (!$('#langSheet').hidden) closeLangSheet();
    else if (!$('#loginPage').hidden) closeLogin();
    else if (!$('#subPage').hidden) closeSub();
    else if (!$('#settingsPage').hidden) closeSettings();
    else closeDrawer();
  });

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (state.settings.theme === 'auto') applyTheme();
  });
}

async function unlock() {
  const error = $('#lockErr');
  error.hidden = true;
  const password = $('#lockInput').value;
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      error.textContent = data.error || '密码不对';
      error.hidden = false;
      return;
    }
    state.token = data.token || '';
    LS.set('token', state.token);
    $('#lockInput').value = '';
    await enterApp();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  }
}

async function regenerate() {
  const conv = state.current;
  if (!conv || state.sending) return;
  while (conv.messages.length && conv.messages[conv.messages.length - 1].role === 'assistant') {
    conv.messages.pop();
  }
  renderMessages();
  await persist(conv, false);
  await reply(conv);
}

function updateModeLabels() {
  const label = window.AFVNative
    ? 'ANDROID APP'
    : state.mode === 'server'
      ? 'LOCAL SERVER'
      : 'BROWSER MODE';
  $('#sbReady').innerHTML = `<i class="dot"></i>${label}`;
}

boot();

/* 安卓返回键：先收弹层，再交给系统 */
window.AFV = {
  back() {
    try {
      if (state.menu) {
        closeMenu();
        return true;
      }
      if (!$('#langSheet').hidden) {
        closeLangSheet();
        return true;
      }
      if (!$('#loginPage').hidden) {
        closeLogin();
        return true;
      }
      if (!$('#subPage').hidden) {
        closeSub();
        return true;
      }
      if (!$('#settingsPage').hidden) {
        closeSettings();
        return true;
      }
      if (document.body.dataset.drawer === 'open') {
        closeDrawer();
        return true;
      }
    } catch {}
    return false;
  },
};

/* 离线外壳（安卓壳自己带资源，不需要 service worker） */
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.AFVNative) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

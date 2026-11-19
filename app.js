/**
 * ForgeVision · 推想视限
 * 前端主程序：无框架，原生 DOM。
 */

import { renderMarkdown, escapeHtml } from './markdown.js';
import { createServerStore, createLocalStore } from './storage.js';

const $ = (selector, root = document) => root.querySelector(selector);

/**
 * 模型清单。
 * upstream 是真正发给 API 的模型名：暂时只有第一个能直连 DeepSeek 官方，
 * 其余先占位，等接入各自的网关后改 upstream 即可。
 */
const MODELS = [
  { id: 'deepseek-V4.1-Flash', upstream: 'deepseek-chat' },
  { id: 'Qwen-3.7-Flash', upstream: 'Qwen-3.7-Flash' },
  { id: 'GPT-5.6 Luna', upstream: 'GPT-5.6 Luna' },
  { id: 'GPT-6 Luna', upstream: 'GPT-6 Luna' },
  { id: 'Grok 4.5', upstream: 'Grok 4.5' },
  { id: 'Grok 4.7', upstream: 'Grok 4.7' },
  { id: 'Gemini 2.5 Flash-Lite', upstream: 'Gemini 2.5 Flash-Lite' },
  { id: 'Gemini 3.5 Flash-Lite', upstream: 'Gemini 3.5 Flash-Lite' },
  { id: 'Claude Haiku 4.5', upstream: 'Claude Haiku 4.5' },
  { id: 'GLM-5.3-Flash', upstream: 'GLM-5.3-Flash' },
  { id: 'Fledge Alpha Free', upstream: 'Fledge Alpha Free' },
];

const APP_VERSION = '0.2.0-rc.1';

const SUB_TITLES = {
  account: '账号',
  models: '模型',
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

  try {
    await streamReply(payload, conv.model, (delta) => {
      text += delta;
      if (performance.now() - last > 60) {
        last = performance.now();
        paint();
      } else {
        schedulePaint();
      }
    }, state.abort.signal);
  } catch (err) {
    if (err.name !== 'AbortError') {
      if (/密码|401/.test(err.message || '')) {
        showLock();
      }
      text = text ? `${text}\n\n> ⚠️ ${err.message}` : `⚠️ ${err.message}`;
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

async function streamReply(messages, model, onDelta, signal) {
  const isServer = state.mode === 'server';
  const cfg = modelConfig(model);
  const base = (cfg.baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url = isServer ? '/api/chat' : `${base}/chat/completions`;
  const headers = { 'Content-Type': 'application/json' };
  if (isServer) {
    if (state.token) headers['x-afv-session'] = state.token;
  } else {
    headers.Authorization = `Bearer ${cfg.apiKey || ''}`;
  }

  const payload = { model, messages, stream: true, temperature: 1 };
  if (cfg.upstream) payload.upstream = cfg.upstream;
  if (isServer) {
    if (cfg.apiKey) payload.apiKey = cfg.apiKey;
    if (cfg.baseUrl) payload.baseUrl = cfg.baseUrl;
    if (cfg.upstream) payload.upstream = cfg.upstream;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let message = `请求失败（${res.status}）`;
    try {
      const data = await res.json();
      message = data?.error?.message || data?.error || message;
    } catch {
      /* 非 JSON */
    }
    throw new Error(message);
  }

  await readStream(res.body, onDelta);
}

async function readStream(body, onDelta) {
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
        const delta = json.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) onDelta(delta);
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
  menu.className = `menu${options.compact ? ' menu--compact' : ''}`;
  menu.innerHTML = items
    .map(
      (item) =>
        `<button class="menu-item${item.active ? ' is-active' : ''}${item.danger ? ' is-danger' : ''}" data-value="${escapeHtml(item.value)}">` +
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

function currentModel() {
  return state.current?.model || state.settings.model || MODELS[0].id;
}

function modelConfig(id) {
  return state.modelConfigs[id] || {};
}

function modelReady(id) {
  if (modelConfig(id).apiKey) return true;
  // 服务端 .env 里的 key 只兜底默认模型
  if (state.mode === 'server' && state.config.apiKeyReady && id === MODELS[0].id) return true;
  return false;
}

function modelLabel(id) {
  return MODELS.find((m) => m.id === id)?.id || id;
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
  openMenu(
    anchor,
    MODELS.map((m) => ({ value: m.id, label: m.id, active: m.id === state.settings.model })),
    (value) => {
      setModel(value);
      toast(`模型：${value}`);
    },
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
      `<div class="model-tip">给每个模型填上自己的 API 密钥，填完就能用；没填的不能发消息。</div>` +
      `<div class="model-list">` +
      MODELS.map((model) => {
        const cfg = modelConfig(model.id);
        const ready = modelReady(model.id);
        return (
          `<div class="model-item" data-id="${escapeHtml(model.id)}">` +
          `<button class="model-head" type="button">` +
          `<span class="model-name">${escapeHtml(model.id)}</span>` +
          `<span class="model-dot${ready ? ' on' : ''}"></span>` +
          `<span class="model-edit">编辑</span>` +
          `</button>` +
          `<div class="model-body"><div class="model-body-inner">` +
          `<label class="sub-label">API 密钥</label>` +
          `<input class="plain-input" data-field="apiKey" type="password" placeholder="留空使用已保存的凭据" value="${escapeHtml(cfg.apiKey || '')}" autocomplete="off" spellcheck="false" />` +
          `<button class="model-custom-toggle" type="button">自定义设置</button>` +
          `<div class="model-custom" hidden>` +
          `<label class="sub-label">API 地址</label>` +
          `<input class="plain-input" data-field="baseUrl" placeholder="https://api.deepseek.com" value="${escapeHtml(cfg.baseUrl || '')}" autocomplete="off" spellcheck="false" />` +
          `<label class="sub-label">上游模型名称</label>` +
          `<input class="plain-input" data-field="upstream" placeholder="默认与显示名相同" value="${escapeHtml(cfg.upstream || '')}" autocomplete="off" spellcheck="false" />` +
          `</div>` +
          `<div class="model-actions">` +
          `<button class="btn" type="button" data-act="cancel">取消</button>` +
          `<button class="btn primary" type="button" data-act="save">保存</button>` +
          `</div>` +
          `</div></div>` +
          `</div>`
        );
      }).join('') +
      `</div>`;

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

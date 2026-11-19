/**
 * ForgeVision · 推想视限
 * 前端主程序：无框架，原生 DOM。
 */

import { renderMarkdown, escapeHtml } from './markdown.js';
import { createServerStore, createLocalStore } from './storage.js';

const $ = (selector, root = document) => root.querySelector(selector);

const MODELS = [
  { id: 'deepseek-chat', label: 'DeepSeek V3', hint: '日常对话' },
  { id: 'deepseek-reasoner', label: 'DeepSeek R1', hint: '深入推理' },
];

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

const DEFAULT_SETTINGS = { theme: 'light', fontSize: 16, model: 'deepseek-chat', apiKey: '' };

const state = {
  mode: 'local',
  config: { models: MODELS, defaultModel: 'deepseek-chat', authRequired: false, apiKeyReady: false },
  store: null,
  token: LS.get('token', ''),
  settings: { ...DEFAULT_SETTINGS, ...LS.get('settings', {}) },
  convs: [],
  cache: new Map(),
  current: null,
  sending: false,
  abort: null,
  filter: '',
  pickerMode: 'attach',
  menu: null,
  typewriter: null,
};

/* ================================================================== */
/* 启动                                                                */
/* ================================================================== */

async function boot() {
  applyTheme();
  applyFontSize();
  await detectMode();
  bindUI();
  if (state.mode === 'server' && state.config.authRequired && !state.token) {
    showLock();
    return;
  }
  await enterApp();
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
    state.config = { models: MODELS, defaultModel: 'deepseek-chat', authRequired: false, apiKeyReady: false };
    state.store = createLocalStore();
  }
}

async function enterApp() {
  updateModeLabels();
  await refreshList();
  const params = new URLSearchParams(location.search);
  const target = params.get('c');
  if (target) await openConversation(target);
  else newChat(true);
  $('#lock').hidden = true;
  setTimeout(() => $('#input').focus(), 60);
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

function renderList() {
  const list = $('#sessionList');
  const rows = state.convs;
  $('#sessionEmpty').hidden = rows.length > 0;
  list.hidden = rows.length === 0;

  const order = ['今天', '昨天', '7 天内', '30 天内', '更早'];
  const buckets = new Map(order.map((key) => [key, []]));
  for (const conv of rows) {
    const label = groupLabel(conv.updatedAt || conv.createdAt || 0);
    (buckets.get(label) || buckets.get('更早')).push(conv);
  }

  const html = [];
  for (const key of order) {
    const group = buckets.get(key);
    if (!group.length) continue;
    html.push(`<div class="sb-group-title">${key}</div>`);
    for (const conv of group) {
      const active = state.current && state.current.id === conv.id;
      html.push(
        `<div class="sb-item" role="button" tabindex="0" data-id="${conv.id}" aria-current="${active}">` +
          `<span class="sb-item-title">${escapeHtml(conv.title || '未命名对话')}</span>` +
          `<span class="sb-item-time">${timeLabel(conv.updatedAt || conv.createdAt || Date.now())}</span>` +
          `<button class="sb-item-del" data-del="${conv.id}" title="删除对话" aria-label="删除对话">` +
          `<svg viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8"/></svg></button>` +
          `</div>`,
      );
    }
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
  const matched = state.convs.filter((conv) => String(conv.title || '').toLowerCase().includes(keyword));
  const saved = state.convs;
  state.convs = matched;
  renderList();
  state.convs = saved;

  if (matched.length === 0) {
    // 标题没命中时再翻内容
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
    state.convs = hits.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    renderList();
    state.convs = await state.store.list().catch(() => state.convs);
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
  syncModelLabels();
  $('#chatTitle').textContent = conv.title || '未命名对话';
  renderMessages();
  showHero(false);
  renderList();
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
    (streaming ? '' : `<button class="msg-act" data-regen title="重新生成"><svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.6-3.7"/><path d="M13 3v3h-3"/></svg>重新生成</button>`) +
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

async function sendMessage() {
  const input = $('#input');
  const text = input.value.trim();
  if (!text || state.sending) return;

  if (state.mode === 'server' && !state.config.apiKeyReady) {
    toast('服务端还没有配置 DEEPSEEK_API_KEY');
    return;
  }
  if (state.mode === 'local' && !state.settings.apiKey) {
    openSettings();
    toast('先填一个 DeepSeek API Key');
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
    if (err.name === 'AbortError') {
      if (!text.trim()) text = '';
    } else if (/密码|401/.test(err.message || '')) {
      showLock();
      text = text || `请求被拒绝：${err.message}`;
    } else {
      const note = text ? `${text}\n\n> ⚠️ ${err.message}` : `⚠️ ${err.message}`;
      text = note;
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
  const url = isServer ? '/api/chat' : 'https://api.deepseek.com/chat/completions';
  const headers = { 'Content-Type': 'application/json' };
  if (isServer) {
    if (state.token) headers['x-afv-session'] = state.token;
  } else {
    headers.Authorization = `Bearer ${state.settings.apiKey}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({ model, messages, stream: true, temperature: 1 }),
  });

  if (!res.ok) {
    let message = `请求失败（${res.status}）`;
    try {
      const data = await res.json();
      message = data?.error?.message || data?.error || message;
    } catch {
      /* 非 JSON 响应 */
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
      const lines = part.split('\n');
      for (const line of lines) {
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
/* 空态书法打字机（照搬 DSH orca-link 的节奏）                          */
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
    this.running = false;
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
    this.running = true;
    this.previous = -1;
    this.order = [];
    this.render('');
    this.schedule(() => this.playGroup(), OPEN_DELAY_MS);
  }

  stop(restore) {
    this.clear();
    this.generation += 1;
    this.running = false;
    if (restore && this.el) this.el.textContent = '';
  }
}

/* ================================================================== */
/* 菜单 / 弹层                                                         */
/* ================================================================== */

function closeMenu() {
  if (state.menu) {
    state.menu.remove();
    state.menu = null;
  }
}

function openMenu(anchor, items, onPick) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.innerHTML = items
    .map(
      (item) =>
        `<button class="menu-item${item.active ? ' is-active' : ''}" data-value="${item.value}">` +
        `<span>${escapeHtml(item.label)}</span>` +
        (item.hint ? `<em>${escapeHtml(item.hint)}</em>` : '') +
        `</button>`,
    )
    .join('');
  document.body.appendChild(menu);
  state.menu = menu;

  const rect = anchor.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  let left = Math.min(rect.left, window.innerWidth - width - 10);
  left = Math.max(10, left);
  let top = rect.bottom + 6;
  if (top + height > window.innerHeight - 10) top = rect.top - height - 6;
  menu.style.left = `${left}px`;
  menu.style.top = `${Math.max(10, top)}px`;

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
/* 主题 / 外观                                                         */
/* ================================================================== */

function applyTheme() {
  const pref = state.settings.theme || 'light';
  const dark =
    pref === 'dark' ||
    (pref === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  document.body.dataset.theme = dark ? 'dark' : 'light';
}

function applyFontSize() {
  document.documentElement.style.setProperty('--font-size-body', `${state.settings.fontSize || 16}px`);
  const range = $('#setFont');
  if (range) range.value = state.settings.fontSize || 16;
}

function saveSettings() {
  LS.set('settings', state.settings);
}

function syncModelLabels() {
  const current = state.current?.model || state.settings.model || state.config.defaultModel || 'deepseek-chat';
  const model = MODELS.find((m) => m.id === current) || MODELS[0];
  $('#sbModel').textContent = current;
  $('#modelChipLabel').textContent = model.label;
  $('#toolModelLabel').textContent = current;
  $('#toolModel').dataset.reasoning = String(current === 'deepseek-reasoner');
}

function updateModeLabels() {
  $('#sbStore').textContent = state.mode === 'server' ? '本机' : '浏览器';
  $('#sbUserSub').textContent =
    state.mode === 'server' ? '数据存在这台电脑' : '数据只存在这台设备';
  $('#sbReady').innerHTML = `<i class="dot"></i>${state.mode === 'server' ? 'LOCAL SERVER' : 'BROWSER MODE'}`;
  $('#setKeyBlock').hidden = state.mode === 'server';
  $('#setKeyHint').textContent =
    state.mode === 'server'
      ? 'Key 由本机服务的 .env 提供，这里不用填。'
      : '只存在这台设备的浏览器里，不会上传到任何地方。';
  $('#setStoreHint').textContent =
    state.mode === 'server'
      ? '会话保存在项目 data/ 目录，每天自动留一份备份。'
      : '会话保存在浏览器本地（IndexedDB）。换浏览器或清理数据前请先导出。';
  if (state.mode === 'server' && !state.config.apiKeyReady) {
    $('#setStoreHint').textContent =
      '服务端还没有配置 DEEPSEEK_API_KEY，先打开项目里的 .env 填上再重启服务。';
  }
}

/* ================================================================== */
/* 设置                                                                */
/* ================================================================== */

function openSettings() {
  const modal = $('#settingsModal');
  modal.hidden = false;
  $('#setKey').value = state.mode === 'local' ? state.settings.apiKey || '' : '';

  const models = state.config.models?.length ? state.config.models : MODELS;
  $('#setModels').innerHTML = models
    .map(
      (m) =>
        `<button data-model="${m.id}" aria-pressed="${String(state.settings.model === m.id)}">${escapeHtml(
          m.label || m.id,
        )}</button>`,
    )
    .join('');

  $('#setTheme').querySelectorAll('button').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.theme === (state.settings.theme || 'light')));
  });
  $('#setFont').value = state.settings.fontSize || 16;
}

function closeSettings() {
  $('#settingsModal').hidden = true;
}

/* ================================================================== */
/* 文件                                                                */
/* ================================================================== */

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

function scrollToBottom(force = false) {
  const scroller = $('#chatScroll');
  if (!scroller) return;
  scroller.scrollTop = scroller.scrollHeight;
  if (force) scroller.scrollTop = scroller.scrollHeight;
}

function maybeScroll() {
  const scroller = $('#chatScroll');
  const gap = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
  if (gap < 160) scroller.scrollTop = scroller.scrollHeight;
}

/* ================================================================== */
/* 事件绑定                                                            */
/* ================================================================== */

function bindUI() {
  document.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]');
    if (action) {
      const name = action.dataset.action;
      if (name === 'new-chat') newChat(true);
      else if (name === 'open-settings') openSettings();
      else if (name === 'toggle-theme') {
        const order = ['light', 'dark', 'auto'];
        const next = order[(order.indexOf(state.settings.theme || 'light') + 1) % order.length];
        state.settings.theme = next;
        saveSettings();
        applyTheme();
        toast(next === 'auto' ? '跟随系统' : next === 'dark' ? '深色' : '浅色');
      } else if (name === 'close-sidebar') closeDrawer();
      else if (name === 'collapse') toggleSidebar();
    }

    const chip = event.target.closest('.chip');
    if (chip) {
      $('#input').value = chip.dataset.prompt || chip.textContent;
      autoGrow();
      $('#input').focus();
    }

    const copyButton = event.target.closest('.code-copy');
    if (copyButton) {
      const code = copyButton.closest('pre')?.querySelector('code');
      if (code) {
        navigator.clipboard.writeText(code.innerText).then(() => {
          copyButton.textContent = '已复制';
          setTimeout(() => {
            copyButton.textContent = '复制';
          }, 1200);
        });
      }
    }

    const msgCopy = event.target.closest('[data-copy]');
    if (msgCopy) {
      const article = msgCopy.closest('.msg');
      const text = article?.querySelector('.md')?.innerText || article?.querySelector('.bubble')?.innerText || '';
      navigator.clipboard.writeText(text).then(() => toast('已复制'));
    }

    const msgRegen = event.target.closest('[data-regen]');
    if (msgRegen && state.current && !state.sending) {
      regenerate();
    }
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

  $('#sessionList').addEventListener('click', async (event) => {
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
    const item = event.target.closest('.sb-item');
    if (item) openConversation(item.dataset.id);
  });

  $('#sessionList').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const item = event.target.closest('.sb-item');
    if (item) openConversation(item.dataset.id);
  });

  $('#searchInput').addEventListener('input', (event) => {
    state.filter = event.target.value;
    applyFilter();
  });

  $('#modelChip').addEventListener('click', (event) => {
    event.stopPropagation();
    pickModel(event.currentTarget);
  });
  $('#toolModel').addEventListener('click', (event) => {
    event.stopPropagation();
    pickModel(event.currentTarget);
  });

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

  $('#settingsClose').addEventListener('click', closeSettings);
  $('#settingsModal').addEventListener('click', (event) => {
    if (event.target === $('#settingsModal')) closeSettings();
  });

  $('#setKey').addEventListener('change', (event) => {
    state.settings.apiKey = event.target.value.trim();
    saveSettings();
    toast('已保存');
  });

  $('#setModels').addEventListener('click', (event) => {
    const button = event.target.closest('[data-model]');
    if (!button) return;
    state.settings.model = button.dataset.model;
    saveSettings();
    if (state.current) {
      state.current.model = state.settings.model;
      persist(state.current, false);
    }
    syncModelLabels();
    openSettings();
  });

  $('#setTheme').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-theme]');
    if (!button) return;
    state.settings.theme = button.dataset.theme;
    saveSettings();
    applyTheme();
    openSettings();
  });

  $('#setFont').addEventListener('input', (event) => {
    state.settings.fontSize = Number(event.target.value);
    saveSettings();
    applyFontSize();
  });

  $('#exportBtn').addEventListener('click', async () => {
    try {
      const data = await state.store.exportAll();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJSON(data, `forgevision-${stamp}.json`);
      toast('已导出');
    } catch (err) {
      toast(`导出失败：${err.message}`);
    }
  });

  $('#importBtn').addEventListener('click', () => {
    state.pickerMode = 'import';
    const picker = $('#filePicker');
    picker.accept = '.json,application/json';
    picker.click();
  });

  $('#clearBtn').addEventListener('click', async () => {
    if (!confirm('清空这台设备上的全部对话？建议先导出备份。')) return;
    for (const conv of state.convs) {
      await state.store.remove(conv.id).catch(() => {});
    }
    state.cache.clear();
    newChat();
    await refreshList();
    toast('已清空');
  });

  $('#attachBtn').addEventListener('click', () => {
    state.pickerMode = 'attach';
    const picker = $('#filePicker');
    picker.accept = '.txt,.md,.json,.csv,.log,.js,.ts,.py,.html,.css';
    picker.click();
  });

  $('#filePicker').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (state.pickerMode === 'import') {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const result = await state.store.importAll(data);
        await refreshList();
        toast(`导入完成，共 ${result.saved ?? state.convs.length} 段`);
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

  $('#lockBtn').addEventListener('click', unlock);
  $('#lockInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') unlock();
  });

  window.addEventListener('resize', () => {
    closeMenu();
    if (!isNarrow()) closeDrawer();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      closeSettings();
      closeDrawer();
    }
  });

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (state.settings.theme === 'auto') applyTheme();
  });
}

function pickModel(anchor) {
  const models = state.config.models?.length ? state.config.models : MODELS;
  const active = state.current?.model || state.settings.model;
  openMenu(
    anchor,
    models.map((m) => ({
      value: m.id,
      label: m.label || m.id,
      hint: m.hint || '',
      active: m.id === active,
    })),
    (value) => {
      state.settings.model = value;
      saveSettings();
      if (state.current) {
        state.current.model = value;
        persist(state.current, false);
      }
      syncModelLabels();
      toast(`已切换到 ${models.find((m) => m.id === value)?.label || value}`);
    },
  );
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
  conv.messages = conv.messages.slice();
  renderMessages();
  await persist(conv, false);
  await reply(conv);
}

boot();

/* 离线外壳 */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* 开发环境或 http 下注册失败不影响使用 */
    });
  });
}

/**
 * 轻量 Markdown 渲染器（无依赖，先转义再解析，避免 XSS）
 * 支持：标题、段落、换行、粗体/斜体/删除线、行内代码、代码块、
 *       有序/无序列表（含一层缩进）、引用、分割线、链接、表格。
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function inline(raw) {
  let out = escapeHtml(raw);

  const codes = [];
  out = out.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });

  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_, text, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`,
  );

  out = out.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^\n_]+?)__/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*/g, '$1<em>$2</em>');
  out = out.replace(/~~([^\n~]+?)~~/g, '<del>$1</del>');

  out = out.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)]);
  return out;
}

function renderCodeBlock(lang, code) {
  const label = (lang || 'text').trim().toLowerCase();
  return (
    `<pre data-lang="${escapeHtml(label)}">` +
    `<div class="code-head"><span>${escapeHtml(label)}</span>` +
    `<button class="code-copy" type="button">复制</button></div>` +
    `<code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`
  );
}

function isTableSeparator(line) {
  return /^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/.test(line) && line.includes('-');
}

function splitRow(line) {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  return text.split('|').map((cell) => cell.trim());
}

export function renderMarkdown(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let i = 0;

  const isBlockStart = (line) =>
    /^\s*```/.test(line) ||
    /^\s{0,3}#{1,6}\s/.test(line) ||
    /^\s{0,3}>\s?/.test(line) ||
    /^\s*([-*+]|\d+\.)\s+/.test(line) ||
    /^\s*([-*_])\s*\1\s*\1\s*$/.test(line) ||
    isTableSeparator(line);

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    if (/^\s*```/.test(line)) {
      const lang = line.replace(/^\s*```/, '').trim();
      const buf = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      html.push(renderCodeBlock(lang, buf.join('\n')));
      continue;
    }

    const heading = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1\s*$/.test(line)) {
      html.push('<hr />');
      i += 1;
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s{0,3}>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i += 1;
      }
      html.push(`<blockquote>${buf.map((p) => `<p>${inline(p)}</p>`).join('')}</blockquote>`);
      continue;
    }

    // 表格
    if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      html.push(
        `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>` +
          rows
            .map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
            .join('') +
          '</tbody></table>',
      );
      continue;
    }

    // 列表
    const listMatch = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2]);
      const items = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (!m) break;
        const indent = m[1].replace(/\t/g, '  ').length;
        const content = [m[3]];
        i += 1;
        while (
          i < lines.length &&
          lines[i].trim() !== '' &&
          !/^(\s*)([-*+]|\d+\.)\s+/.test(lines[i]) &&
          !isBlockStart(lines[i])
        ) {
          content.push(lines[i].trim());
          i += 1;
        }
        items.push({ indent, text: content.join('\n') });
      }
      const render = (list, level) => {
        const tag = ordered ? 'ol' : 'ul';
        let out = `<${tag}>`;
        let index = 0;
        while (index < list.length) {
          const item = list[index];
          if (item.indent > level) {
            const nested = [];
            while (index < list.length && list[index].indent > level) {
              nested.push(list[index]);
              index += 1;
            }
            out = out.replace(/<\/li>$/, `${render(nested, level + 2)}</li>`);
            continue;
          }
          out += `<li>${inline(item.text)}</li>`;
          index += 1;
        }
        return out + `</${tag}>`;
      };
      html.push(render(items, 0));
      continue;
    }

    // 段落
    const buf = [line];
    i += 1;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !isBlockStart(lines[i])
    ) {
      buf.push(lines[i]);
      i += 1;
    }
    html.push(`<p>${buf.map((l) => inline(l)).join('<br />')}</p>`);
  }

  return html.join('');
}

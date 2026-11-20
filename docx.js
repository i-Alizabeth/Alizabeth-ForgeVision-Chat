/**
 * docx → 纯文本。
 * 不用第三方库：docx 就是个 zip，里面 word/document.xml 才是正文，
 * 浏览器自带 DecompressionStream('deflate-raw') 就能解。
 */

function u16(view, offset) {
  return view.getUint16(offset, true);
}
function u32(view, offset) {
  return view.getUint32(offset, true);
}

/* 从尾巴往前找中央目录结束标记 */
function findEocd(view) {
  const limit = Math.max(0, view.byteLength - 65557);
  for (let index = view.byteLength - 22; index >= limit; index -= 1) {
    if (u32(view, index) === 0x06054b50) return index;
  }
  return -1;
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('这个浏览器内核不支持解压 docx，请更新系统 WebView');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* 在 zip 里按名字取一个文件的内容 */
async function readZipEntry(buffer, wanted) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocd = findEocd(view);
  if (eocd < 0) throw new Error('这个文件不是有效的 docx');

  const count = u16(view, eocd + 10);
  let pointer = u32(view, eocd + 16);
  const decoder = new TextDecoder('utf-8');

  for (let index = 0; index < count; index += 1) {
    if (u32(view, pointer) !== 0x02014b50) break;
    const method = u16(view, pointer + 10);
    const compressedSize = u32(view, pointer + 20);
    const nameLength = u16(view, pointer + 28);
    const extraLength = u16(view, pointer + 30);
    const commentLength = u16(view, pointer + 32);
    const localOffset = u32(view, pointer + 42);
    const name = decoder.decode(bytes.subarray(pointer + 46, pointer + 46 + nameLength));

    if (name === wanted) {
      const localNameLength = u16(view, localOffset + 26);
      const localExtraLength = u16(view, localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(start, start + compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      throw new Error('docx 压缩方式不认识');
    }

    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function documentXmlToText(xml) {
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  if (dom.querySelector('parsererror')) throw new Error('docx 正文解析失败');
  const paragraphs = dom.getElementsByTagNameNS(W, 'p');
  const lines = [];
  for (const paragraph of paragraphs) {
    let line = '';
    for (const node of paragraph.getElementsByTagNameNS(W, '*')) {
      if (node.namespaceURI !== W) continue;
      if (node.localName === 't') line += node.textContent || '';
      else if (node.localName === 'tab') line += '\t';
      else if (node.localName === 'br' || node.localName === 'cr') line += '\n';
    }
    lines.push(line);
  }
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function docxToText(arrayBuffer) {
  const xmlBytes = await readZipEntry(arrayBuffer, 'word/document.xml');
  if (!xmlBytes) throw new Error('docx 里没找到正文');
  const text = documentXmlToText(new TextDecoder('utf-8').decode(xmlBytes));
  if (!text) throw new Error('这个 docx 里没有可读的文字');
  return text;
}

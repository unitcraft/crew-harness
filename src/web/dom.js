// dom.js — общие помощники рисования: узел с свойствами и значок из встроенного спрайта.
// Текст всегда идёт через textContent: разметка из данных невозможна.

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(doc, tag, props = {}, ...children) {
  const node = doc.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child !== false && child !== null && child !== undefined) node.append(child);
  return node;
}

export function svgNode(doc, tag, attrs = {}) {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** Значок из встроенного в index.html спрайта (источник icons.svg): id — литерал вида 'i-имя'. */
export function icon(doc, id, extra = '') {
  const svg = svgNode(doc, 'svg', { class: extra ? `icon ${extra}` : 'icon', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgNode(doc, 'use', { href: `#${id}` }));
  return svg;
}

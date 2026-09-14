/* A SMALL DOM FOR SCREEN TESTS - not a test file itself (node --test runs *.test.mjs).
 *
 * Enough of `document` to render a screen and tap it: elements with classes,
 * attributes, dataset, style custom properties, children, text, listeners, and the
 * simple selectors the screens use - a tag, .class, [attr] and [attr="v"], compound
 * (button.sq-cell[data-mine="true"]) and a descendant space. Not a browser: layout is
 * closed at 393px in real Chrome, never here.
 *
 * click() runs every click listener and returns a promise of them all, so a test can
 * await a handler that returns one; settle() waits out handlers that do not.
 */
export function makeDom() {
  const all = (n, out = []) => { out.push(n); for (const c of n.children) all(c, out); return out; };

  function parse(sel) {
    return sel.trim().split(/\s+/).map((part) => {
      const tag = (part.match(/^[a-zA-Z][a-zA-Z0-9-]*/) || [''])[0].toLowerCase();
      const classes = [...part.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
      const attrs = [...part.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g)].map((m) => [m[1], m[2]]);
      return { tag, classes, attrs };
    });
  }
  function attrOf(n, k) {
    if (k.startsWith('data-')) {
      const key = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return Object.prototype.hasOwnProperty.call(n.dataset, key) ? String(n.dataset[key]) : null;
    }
    if (k === 'id') return n.id || null;
    return Object.prototype.hasOwnProperty.call(n.attrs, k) ? n.attrs[k] : null;
  }
  function one(n, s) {
    if (!n.tagName || n.tagName === '#text') return false;
    if (s.tag && n.tagName.toLowerCase() !== s.tag) return false;
    if (s.classes.some((c) => !n.classList.contains(c))) return false;
    return s.attrs.every(([k, v]) => { const a = attrOf(n, k); return v === undefined ? a !== null : a === v; });
  }
  function matches(n, chain) {
    if (!one(n, chain[chain.length - 1])) return false;
    let i = chain.length - 2;
    let p = n.parentNode;
    while (i >= 0 && p) { if (one(p, chain[i])) i--; p = p.parentNode; }
    return i < 0;
  }

  function mk(tag) {
    const node = {
      tagName: String(tag).toUpperCase(), children: [], parentNode: null, attrs: {}, dataset: {},
      hidden: false, disabled: false, listeners: {}, _class: '', _text: '',
      style: { props: {}, setProperty(k, v) { this.props[k] = String(v); }, getPropertyValue(k) { return this.props[k] || ''; } },
      get className() { return node._class; },
      set className(v) { node._class = String(v); },
      classList: {
        list() { return node._class ? node._class.split(/\s+/).filter(Boolean) : []; },
        add(...cs) { const h = node.classList.list(); for (const c of cs) if (!h.includes(c)) h.push(c); node._class = h.join(' '); },
        remove(...cs) { node._class = node.classList.list().filter((x) => !cs.includes(x)).join(' '); },
        contains(c) { return node.classList.list().includes(c); },
        toggle(c, on) { const want = on === undefined ? !node.classList.contains(c) : !!on; if (want) node.classList.add(c); else node.classList.remove(c); return want; }
      },
      get textContent() { return node._text + node.children.map((c) => c.textContent).join(''); },
      set textContent(v) { for (const c of node.children) c.parentNode = null; node.children = []; node._text = v == null ? '' : String(v); },
      get innerHTML() { return ''; },
      set innerHTML(v) { for (const c of node.children) c.parentNode = null; node.children = []; node._text = ''; },
      get firstChild() { return node.children[0] || null; },
      get isConnected() { let n = node; while (n.parentNode) n = n.parentNode; return !!n.connected; },
      appendChild(c) {
        if (c.fragment) { for (const k of [...c.children]) node.appendChild(k); return c; }
        if (c.parentNode) c.parentNode.removeChild(c);
        c.parentNode = node; node.children.push(c); return c;
      },
      append(...cs) { for (const c of cs) node.appendChild(typeof c === 'string' ? text(c) : c); },
      removeChild(c) { node.children = node.children.filter((x) => x !== c); c.parentNode = null; return c; },
      remove() { if (node.parentNode) node.parentNode.removeChild(node); },
      setAttribute(k, v) { node.attrs[k] = String(v); if (k === 'id') node.id = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(node.attrs, k) ? node.attrs[k] : null; },
      removeAttribute(k) { delete node.attrs[k]; },
      addEventListener(t, fn) { (node.listeners[t] || (node.listeners[t] = [])).push(fn); },
      click() {
        if (node.disabled) return Promise.resolve();
        const ev = { type: 'click', target: node, preventDefault() {} };
        const out = (node.listeners.click || []).map((fn) => fn(ev));
        if (typeof node.onclick === 'function') out.push(node.onclick(ev));
        return Promise.all(out).then(() => {});
      },
      focus() { node.focused = true; },
      scrollIntoView() {},
      querySelectorAll(sel) { const chain = parse(sel); return all(node).slice(1).filter((n) => matches(n, chain)); },
      querySelector(sel) { return node.querySelectorAll(sel)[0] || null; }
    };
    return node;
  }
  function text(s) {
    const t = mk('#text');
    t.tagName = '#text';
    t._text = String(s);
    return t;
  }
  const document = {
    createElement: mk,
    createElementNS: (_ns, t) => mk(t),
    createTextNode: text,
    createDocumentFragment() { const f = mk('#fragment'); f.fragment = true; return f; },
    getElementById() { return null; }
  };
  /** A root that counts as on the page, so a screen's isConnected checks pass. */
  const mount = () => { const r = mk('div'); r.connected = true; return r; };
  return { document, mount };
}

/** Let promise chains that nothing awaits run: a handler that starts a fetch. */
export async function settle(n = 20) {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
}

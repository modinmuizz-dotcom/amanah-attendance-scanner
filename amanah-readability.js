/* Dark-mode text contrast for legacy and dynamically inserted management views. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) api.install(root);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const mark = 'data-amanah-readable';
  const ink = '--amanah-readable-ink';
  const excluded = 'script,style,template,svg,canvas,iframe,.leaflet-container,.mapboxgl-map,.maplibregl-map,.admin-login-screen,[data-amanah-contrast="off"]';
  function color(value) {
    const match = String(value).match(/^rgba?\(([^)]+)\)$/i);
    if (!match) return null;
    const parts = match[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4) return null;
    const channels = parts.map((v, i) => v.endsWith('%') ? parseFloat(v) * (i === 3 ? .01 : 2.55) : Number(v));
    if (!channels.every(Number.isFinite)) return null;
    return [...channels.slice(0, 3).map(v => Math.max(0, Math.min(255, v))), Math.max(0, Math.min(1, channels[3] ?? 1))];
  }
  function over(fg, bg) {
    const a = fg[3] ?? 1;
    return fg.slice(0, 3).map((v, i) => v * a + bg[i] * (1 - a)).concat(1);
  }
  function luminance(rgb) {
    const linear = rgb.slice(0, 3).map(v => {v /= 255;return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);});
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  }
  function ratio(fg, bg) {
    const a = luminance(over(fg, bg)), b = luminance(bg);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  }
  function readableColor(fg, backgrounds, target = 4.5) {
    if (!fg || !backgrounds.length || backgrounds.every(bg => ratio(fg, bg) >= target)) return null;
    const candidates = [];
    for (const end of [0, 255]) {
      const mix = amount => fg.slice(0, 3).map(v => Math.round(v + (end - v) * amount)).concat(1);
      if (!backgrounds.every(bg => ratio(mix(1), bg) >= target)) continue;
      let low = 0, high = 1;
      for (let i = 0; i < 18; i++) {
        const mid = (low + high) / 2;
        if (backgrounds.every(bg => ratio(mix(mid), bg) >= target)) high = mid; else low = mid;
      }
      candidates.push({amount: high, value: mix(high)});
    }
    // A mixed light/dark image needs its own text backing; do not guess at it.
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.amount - b.amount);
    return candidates[0].value;
  }
  function install(win) {
    if (win.__AMANAH_READABILITY__) return;
    win.__AMANAH_READABILITY__ = true;
    const doc = win.document, html = doc.documentElement;
    const screen = win.matchMedia('screen');
    const style = doc.createElement('style');
    style.id = 'amanahReadabilityStyle';
    // A dedicated important layer wins over legacy stylesheet specificity only
    // for marked text. Original inline colors, light mode and print are retained.
    style.textContent = '@layer amanah-readability{@media screen{html[data-amanah-mode="dark"] body.amanah-common-active [' + mark + '],' +
      'html[data-amanah-mode="dark"] .main-shell [' + mark + ']{color:var(' + ink + ')!important;-webkit-text-fill-color:var(' + ink + ')!important}}}';
    doc.head.appendChild(style);
    const pending = new Set();let timer = 0, observing = false;
    const bodyOptions = {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden','open','disabled','readonly']};
    const observer = new win.MutationObserver(records => {
      for (const record of records) {
        if (record.target === html) queue(doc.body);
        else queue(record.target.nodeType === 1 ? record.target : record.target.parentElement);
      }
    });
    function observe() {
      if (!doc.body) return;
      observer.observe(doc.body, bodyOptions);
      observer.observe(html, {attributes:true,attributeFilter:['data-amanah-mode','data-amanah-theme','data-amanah-render']});
      observing = true;
    }
    function queue(node) {
      if (!node || node.nodeType !== 1 || node.closest(excluded)) return;
      pending.add(node);
      if (!timer) timer = win.setTimeout(scan, 80);
    }
    function scan() {
      timer = 0;
      const roots = [...pending].filter(node => node.isConnected && ![...pending].some(other => other !== node && other.contains(node)));
      pending.clear();
      if (!screen.matches || html.getAttribute('data-amanah-mode') !== 'dark') return;
      observer.disconnect();observing = false;
      try {
        const cache = new WeakMap();
        const computed = node => {if (!cache.has(node)) cache.set(node, win.getComputedStyle(node));return cache.get(node);};
        const nodes = roots.flatMap(node => [node, ...node.querySelectorAll('*')]);
        const corrections = [];
        for (const node of nodes) {
          if (node.hasAttribute(mark)) {node.removeAttribute(mark);node.style.removeProperty(ink);}
        }
        const backgroundCache = new WeakMap();
        function backgrounds(node) {
          if (!node) return [[9, 15, 28, 1]];
          if (backgroundCache.has(node)) return backgroundCache.get(node);
          const s = computed(node), bg = color(s.backgroundColor) || [0, 0, 0, 0];
          let values;
          if (s.backgroundImage && s.backgroundImage !== 'none') {
            // Gradients have computable color stops; photographs and map tiles do not.
            if (/url\(/i.test(s.backgroundImage)) values = [];
            else {
              const stops = (s.backgroundImage.match(/rgba?\([^)]+\)/g) || []).map(color).filter(Boolean);
              const parent = backgrounds(node.parentElement);
              values = stops.length ? stops.flatMap(stop => parent.map(base => over(stop, over(bg, base)))) : [];
            }
          } else values = bg[3] === 1 ? [bg] : backgrounds(node.parentElement).map(base => over(bg, base));
          backgroundCache.set(node, values);return values;
        }
        for (const node of nodes) {
          if (!node.isConnected || node.closest(excluded) || !node.closest('body.amanah-common-active,.main-shell') || !node.getClientRects().length) continue;
          const control = /^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName);
          if (!control && ![...node.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
          if (control && /^(hidden|checkbox|radio|file|color|range)$/i.test(node.type || '')) continue;
          const s = computed(node);
          if (s.visibility !== 'visible') continue;
          const foreground = color(control ? s.webkitTextFillColor || s.color : s.color);
          if (!foreground || foreground[3] === 0) continue;
          const replacement = readableColor(foreground, backgrounds(node));
          if (!replacement) continue;
          corrections.push([node, replacement]);
        }
        for (const [node, replacement] of corrections) {
          node.style.setProperty(ink, 'rgb(' + replacement.slice(0, 3).join(',') + ')');
          node.setAttribute(mark, '');
        }
      } finally {observe();}
    }
    function start() {observe();queue(doc.body);}
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, {once:true}); else start();
    // Also check late CSS, asynchronously opened dialogs, theme changes and hover rows.
    doc.addEventListener('load', event => {if (event.target.tagName === 'LINK') queue(doc.body);}, true);
    for (const name of ['pointerover','pointerout','focusin','focusout']) doc.addEventListener(name, event => {
      queue(event.target.closest?.('tr,.calendar-event,button,a,input,select,textarea'));
    });
    win.addEventListener('resize', () => queue(doc.body));
    screen.addEventListener?.('change', () => queue(doc.body));
    return {refresh:() => queue(doc.body),get observing(){return observing;}};
  }
  return {color,over,luminance,ratio,readableColor,install};
});

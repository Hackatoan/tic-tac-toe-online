// Placeholder protection for machine translation.
// {name}-style tokens are swapped for opaque numbered markers (⟦0⟧, ⟦1⟧, ...) before
// the text is sent to the model, then swapped back afterwards. Any string whose
// markers come back missing/duplicated/altered falls back to the English source.
const TOKEN = /\{[A-Za-z0-9_]+\}/g;
const MARK = /⟦(\d+)⟧/g;

// Deep-walk obj; replace placeholders in every string. Returns { protectedObj, maps }.
export function protect(obj, path = '', maps = {}) {
  if (typeof obj === 'string') {
    const toks = [];
    const s = obj.replace(TOKEN, (m) => { toks.push(m); return `⟦${toks.length - 1}⟧`; });
    if (toks.length) maps[path] = toks;
    return { protectedObj: s, maps };
  }
  if (Array.isArray(obj)) return { protectedObj: obj.map((v, i) => protect(v, `${path}[${i}]`, maps).protectedObj), maps };
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = protect(obj[k], path ? `${path}.${k}` : k, maps).protectedObj;
    return { protectedObj: out, maps };
  }
  return { protectedObj: obj, maps };
}

// Restore placeholders in translated obj. `source` is the original (unprotected)
// English object, used as a per-string fallback. Returns { restored, problems }.
export function restore(translated, source, maps, path = '', problems = []) {
  if (typeof source === 'string') {
    const toks = maps[path] || [];
    if (typeof translated !== 'string') { problems.push(`${path}: missing/non-string`); return { restored: source, problems }; }
    const seen = [...translated.matchAll(MARK)].map((m) => Number(m[1]));
    const ok = seen.length === toks.length && toks.every((_, i) => seen.filter((n) => n === i).length === 1);
    const leftover = translated.replace(MARK, '').match(TOKEN);
    if (!ok || leftover) { problems.push(`${path}: placeholder mismatch -> kept English`); return { restored: source, problems }; }
    return { restored: translated.replace(MARK, (_, n) => toks[Number(n)]), problems };
  }
  if (Array.isArray(source)) {
    const arr = Array.isArray(translated) ? translated : [];
    return { restored: source.map((v, i) => restore(arr[i], v, maps, `${path}[${i}]`, problems).restored), problems };
  }
  if (source && typeof source === 'object') {
    const t = translated && typeof translated === 'object' ? translated : {};
    const out = {};
    for (const k of Object.keys(source)) out[k] = restore(t[k], source[k], maps, path ? `${path}.${k}` : k, problems).restored;
    return { restored: out, problems };
  }
  return { restored: translated === undefined ? source : translated, problems };
}

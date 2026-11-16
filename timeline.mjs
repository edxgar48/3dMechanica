// The beats of a film timeline, for every tool that draws or samples them (capture --stills beats, sheet.mjs,
// wave.mjs). A machine's timeline is {"duration": s, "script": [{"t": s, <move>: ...}, ...]}: the beats are the
// script's times, and the numbers inside a move (an rpm, a wind speed, a cylinder) are not. Any other timeline
// falls back to every number in it except fps and duration.
export function beatTimes(tl) {
  if (Array.isArray(tl.script)) return [...new Set(tl.script.map((e) => e.t))].sort((a, b) => a - b);
  const out = [];
  const walk = (v, key) => {
    if (key === 'fps' || key === 'duration') return;
    if (typeof v === 'number') out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, k));
  };
  walk(tl);
  return out;
}

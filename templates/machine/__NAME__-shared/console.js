// The overlay: a fixed 1600 x 900 CSS layout. Title and the live readouts top left, a chart of the piston's travel over
// one turn (the same function that poses the piston, a marker at the current angle), the speed slider and the view and
// cutaway buttons bottom right, a callout with a leader into the machine, and the operator's cursor.
// update(s) redraws every live part from the frame's state. REPLACE the readouts with your machine's numbers.
import {displacement, P, travel} from './kin.js';

// dark theme: light ink on near-black panels; paper is the fill of an unlit control
export const C = {ink: '#e7e9ec', mute: '#8f959d', faint: '#4a5059', line: '#2b3037', panel: 'rgba(21,24,29,.92)', paper: '#15181d', accent: '#ff3d55'};
export const CAMS = ['hero', 'front', 'side', 'top'];
export const CUTS = ['solid', 'glass'];
export const RPM_MIN = 300;
export const RPM_MAX = 3600;
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;left:0;top:0;width:1600px;height:900px;pointer-events:none}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line}}
.cp{position:absolute;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap}
.mu{color:${C.mute}}
.tb{position:absolute;height:30px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;border:1px solid ${C.line};background:${C.paper};color:${C.ink}}
.big{position:absolute;font-weight:800;letter-spacing:-2px;line-height:1}
.call{position:absolute;white-space:nowrap}
.call b{display:block;font-size:15px;font-weight:600}
.call span{display:block;font-size:11px;font-weight:500;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;margin-top:3px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:2px solid ${C.accent};opacity:0;z-index:49}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};

export function createConsole(app, {title = '__TITLE__'} = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = el(`<div class="ui"></div>`);
  app.appendChild(root);
  const add = (h) => root.appendChild(el(h));

  // title
  add(`<div style="position:absolute;left:40px;top:38px;width:48px;height:3px;background:${C.accent}"></div>`);
  add(`<div style="position:absolute;left:40px;top:52px;font-size:34px;font-weight:700;letter-spacing:-.3px">${title}</div>`);
  add(`<div class="cp mu" style="left:40px;top:98px">BORE ${P.bore} MM · STROKE ${P.stroke} MM · ${displacement.toFixed(1)} CM³</div>`);

  // readouts
  add(`<div class="pn" style="left:40px;top:140px;width:300px;height:250px"></div>`);
  add(`<div class="cp" style="left:56px;top:156px">CRANK ANGLE</div>`);
  const deg = add(`<div class="big" style="left:54px;top:176px;font-size:52px;color:${C.accent}"></div>`);
  add(`<div class="cp" style="left:56px;top:248px">PISTON TRAVEL</div>`);
  const trav = add(`<div class="big" style="left:56px;top:270px;font-size:28px;letter-spacing:-1px"></div>`);
  add(`<div class="cp" style="left:200px;top:248px">PISTON SPEED</div>`);
  const spd = add(`<div class="big" style="left:200px;top:270px;font-size:28px;letter-spacing:-1px"></div>`);
  add(`<div class="cp" style="left:56px;top:322px">ENGINE SPEED</div>`);
  const rpmT = add(`<div class="big" style="left:56px;top:342px;font-size:34px"></div>`);

  // travel over one turn: the chart is drawn from kin.travel, the marker sits at the current angle
  add(`<div class="pn" style="left:40px;top:400px;width:300px;height:200px"></div>`);
  add(`<div class="cp" style="left:56px;top:414px">TRAVEL · ONE TURN</div>`);
  const W = 268;
  const H = 130;
  const X = (a) => (a / 360) * W;
  const Y = (s) => 8 + (s / P.stroke) * (H - 16);
  const pts = Array.from({length: 73}, (_, i) => `${X(i * 5).toFixed(1)},${Y(travel(i * 5)).toFixed(1)}`).join(' ');
  const chart = add(`<svg style="position:absolute;left:56px;top:440px" width="${W}" height="${H}">
    <line x1="0" y1="${Y(0)}" x2="${W}" y2="${Y(0)}" stroke="${C.line}"/><line x1="0" y1="${Y(P.stroke)}" x2="${W}" y2="${Y(P.stroke)}" stroke="${C.line}"/>
    <polyline points="${pts}" fill="none" stroke="${C.ink}" stroke-width="1.5"/>
    <line class="mk" y1="0" y2="${H}" stroke="${C.accent}" stroke-width="1.5"/><circle class="dot" r="4.5" fill="${C.accent}"/></svg>`);
  add(`<div class="cp mu" style="left:56px;top:576px">TDC 0° · BDC 180° · 360°</div>`);
  const mk = chart.querySelector('.mk');
  const dot = chart.querySelector('.dot');

  // buttons: views, cutaway, pause, and the speed slider
  const btn = {};
  add(`<div class="pn" style="left:1180px;top:730px;width:380px;height:140px"></div>`);
  add(`<div class="cp mu" style="left:1196px;top:742px">VIEW</div>`);
  CAMS.forEach((k, i) => (btn[k] = add(`<div class="tb" style="left:${1196 + i * 88}px;top:762px;width:82px">${k}</div>`)));
  add(`<div class="cp mu" style="left:1196px;top:802px">CUTAWAY</div>`);
  CUTS.forEach((k, i) => (btn[k] = add(`<div class="tb" style="left:${1196 + i * 88}px;top:822px;width:82px">${k}</div>`)));
  btn.pause = add(`<div class="tb" style="left:1460px;top:822px;width:82px">pause</div>`);
  add(`<div class="pn" style="left:40px;top:790px;width:360px;height:80px"></div>`);
  add(`<div class="cp mu" style="left:56px;top:802px">ENGINE SPEED · ${RPM_MIN}–${RPM_MAX} RPM</div>`);
  add(`<div style="position:absolute;left:66px;top:841px;width:300px;height:3px;background:${C.line}"></div>`);
  const fill = add(`<div style="position:absolute;left:66px;top:841px;height:3px;background:${C.accent}"></div>`);
  const knob = add(`<div style="position:absolute;top:832px;width:20px;height:20px;margin-left:-10px;border-radius:50%;background:${C.paper};border:2px solid ${C.ink}"></div>`);
  const knobAt = (k) => [66 + 300 * Math.min(1, Math.max(0, k)), 842];

  const centre = (n) => [parseFloat(n.style.left) + parseFloat(n.style.width) / 2, parseFloat(n.style.top) + 15];
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));

  // one callout with a leader into the machine
  const svg = add(`<svg style="position:absolute;left:0;top:0" width="1600" height="900"><polyline fill="none" stroke="${C.ink}" stroke-width="1"/><circle r="3.5" fill="${C.ink}"/></svg>`);
  const lead = svg.querySelector('polyline');
  const leadDot = svg.querySelector('circle');
  const call = add(`<div class="call"><b>Piston</b><span>Driven by the crank through the rod</span></div>`);

  const cur = add(`<svg class="cur" width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7 16 L11 24 L14 23 L10 15 L17 15 Z" fill="#f2f3f5" stroke="#0d0f12" stroke-width="1.6" stroke-linejoin="round"/></svg>`);
  const ring = add(`<div class="ring"></div>`);

  const paint = (n, on) => {
    n.style.background = on ? C.ink : C.paper;
    n.style.color = on ? C.paper : C.ink;
    n.style.borderColor = on ? C.ink : C.line;
  };
  // s: {deg, travel, speed, rpm, cam, cut, paused, callout: {at: [x, y] | null, label: [x, y], o}, cursor}
  const update = (s) => {
    const a = ((s.deg % 360) + 360) % 360;
    deg.textContent = `${a.toFixed(0).padStart(3, '0')}°`;
    trav.textContent = `${s.travel.toFixed(1)} mm`;
    spd.textContent = `${s.speed >= 0 ? '+' : '−'}${Math.abs(s.speed).toFixed(2)} m/s`;
    rpmT.textContent = `${Math.round(s.rpm)} rpm`;
    mk.setAttribute('x1', X(a));
    mk.setAttribute('x2', X(a));
    dot.setAttribute('cx', X(a));
    dot.setAttribute('cy', Y(s.travel));
    const k = (s.rpm - RPM_MIN) / (RPM_MAX - RPM_MIN);
    const [kx] = knobAt(k);
    knob.style.left = `${kx}px`;
    fill.style.width = `${kx - 66}px`;
    for (const c of CAMS) paint(btn[c], c === s.cam);
    for (const c of CUTS) paint(btn[c], c === s.cut);
    paint(btn.pause, s.paused);
    const co = s.callout;
    const show = co && co.at && co.o > 0.01;
    for (const n of [svg, call]) n.style.opacity = show ? co.o : 0;
    if (show) {
      const [lx, ly] = co.label;
      call.style.left = `${lx}px`;
      call.style.top = `${ly - 10}px`;
      lead.setAttribute('points', `${lx - 8},${ly} ${lx - 40},${ly} ${co.at[0]},${co.at[1]}`);
      leadDot.setAttribute('cx', co.at[0]);
      leadDot.setAttribute('cy', co.at[1]);
    }
    const c = s.cursor;
    cur.style.transform = `translate(${c.x - 2}px, ${c.y - 2}px) scale(${c.press ? 0.86 : 1})`;
    ring.style.opacity = c.ring;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.transform = `scale(${1.6 - 0.6 * c.ring})`;
  };
  return {root, btn, spots, knobAt, update};
}

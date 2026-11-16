// The overlay: a fixed 1600 x 900 CSS layout. Title top left, the live readouts (flow, pressure, torque, power) under
// it, the flow ripple over one tooth pitch, the speed and pressure sliders bottom left, how the pump works top right,
// the view and cutaway buttons bottom right, callouts with leaders into the pump, and the operator's cursor.
// update(s) redraws every live part from the frame's state; every number comes from kin.js.
import {contactRatio, displacement, flowAt, meanFlow, P, ripple} from './kin.js';
import {INLET, OUTLET} from './machine.js';

// dark theme: light ink on near-black panels; paper is the fill of an unlit control
export const C = {ink: '#e7e9ec', mute: '#8f959d', faint: '#4a5059', line: '#2b3037', panel: 'rgba(21,24,29,.92)', paper: '#15181d', accent: OUTLET, blue: INLET};
export const CAMS = ['hero', 'front', 'mesh', 'side', 'top'];
export const CUTS = ['solid', 'open', 'glass'];
export const RPM_MAX = 3000;
export const BAR_MAX = 250;
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;left:0;top:0;width:1600px;height:900px;pointer-events:none}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 3px rgba(0,0,0,.35)}
.cp{position:absolute;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap}
.mu{color:${C.mute}}
.tb{position:absolute;height:30px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;border:1px solid ${C.line};background:${C.paper};color:${C.ink}}
.big{position:absolute;font-weight:800;letter-spacing:-1.5px;line-height:1}
.call{position:absolute;white-space:nowrap}
.call b{display:block;font-size:15px;font-weight:600}
.call span{display:block;font-size:11px;font-weight:500;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;margin-top:3px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}
.ring{position:absolute;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:2px solid ${C.accent};opacity:0;z-index:49}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};

export function createConsole(app, {title = 'Gear Pump'} = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = el(`<div class="ui"></div>`);
  app.appendChild(root);
  const add = (h) => root.appendChild(el(h));

  // title
  add(`<div style="position:absolute;left:40px;top:38px;width:48px;height:3px;background:${C.accent}"></div>`);
  add(`<div style="position:absolute;left:40px;top:52px;font-size:34px;font-weight:700;letter-spacing:-.3px">${title}</div>`);
  add(`<div class="cp mu" style="left:40px;top:98px">EXTERNAL GEAR · z ${P.z} · MODULE ${P.m} MM · FACE ${P.b} MM · ${displacement.toFixed(2)} CM³/REV</div>`);

  // live readouts
  add(`<div class="pn" style="left:40px;top:140px;width:330px;height:290px"></div>`);
  add(`<div class="cp" style="left:56px;top:156px">FLOW</div>`);
  const flow = add(`<div class="big" style="left:54px;top:176px;font-size:52px;color:${C.accent}"></div>`);
  add(`<div class="cp mu" style="left:56px;top:234px">L / MIN · THEORETICAL</div>`);
  add(`<div class="cp" style="left:56px;top:262px">OUTLET PRESSURE</div>`);
  const bar = add(`<div class="big" style="left:56px;top:282px;font-size:28px"></div>`);
  add(`<div class="cp" style="left:206px;top:262px">SHAFT SPEED</div>`);
  const rpm = add(`<div class="big" style="left:206px;top:282px;font-size:28px"></div>`);
  add(`<div class="cp" style="left:56px;top:330px">SHAFT TORQUE</div>`);
  const tq = add(`<div class="big" style="left:56px;top:350px;font-size:28px"></div>`);
  add(`<div class="cp" style="left:206px;top:330px">HYDRAULIC POWER</div>`);
  const pw = add(`<div class="big" style="left:206px;top:350px;font-size:28px"></div>`);
  add(`<div class="cp mu" style="left:56px;top:400px">T = Δp·V / 2π · P = Δp·Q</div>`);

  // flow ripple over 90° of shaft: drawn from kin.flowAt, the marker at the current angle
  add(`<div class="pn" style="left:40px;top:440px;width:330px;height:200px"></div>`);
  add(`<div class="cp" style="left:56px;top:454px">FLOW RIPPLE · 90° OF SHAFT</div>`);
  add(`<div class="cp mu" style="left:56px;top:614px">±${((ripple * 100) / 2).toFixed(1)} % · ${P.z} PULSES PER TURN</div>`);
  const W = 298;
  const H = 120;
  const qMin = flowAt(0, 1000);
  const qMax = flowAt(360 / P.z / 2, 1000);
  const X = (deg) => (deg / 90) * W;
  const Y = (q) => 10 + (1 - (q - qMin) / (qMax - qMin)) * (H - 20);
  const pts = Array.from({length: 181}, (_, i) => `${X(i / 2).toFixed(1)},${Y(flowAt(i / 2, 1000)).toFixed(1)}`).join(' ');
  const chart = add(`<svg style="position:absolute;left:56px;top:480px" width="${W}" height="${H}">
    <line x1="0" x2="${W}" y1="${Y(meanFlow(1000))}" y2="${Y(meanFlow(1000))}" stroke="${C.faint}" stroke-dasharray="3 3"/>
    <polyline points="${pts}" fill="none" stroke="${C.ink}" stroke-width="1.5"/>
    <line class="mk" y1="0" y2="${H}" stroke="${C.accent}" stroke-width="1.5"/><circle class="dot" r="4.5" fill="${C.accent}"/></svg>`);
  const mk = chart.querySelector('.mk');
  const dot = chart.querySelector('.dot');

  // how it pumps
  add(`<div class="pn" style="left:1230px;top:140px;width:330px;height:236px"></div>`);
  add(`<div class="cp" style="left:1246px;top:156px">HOW IT PUMPS</div>`);
  add(`<div style="position:absolute;left:1246px;top:184px;width:300px;font-size:13px;line-height:1.55;color:${C.ink}">Oil fills the tooth spaces where the teeth come apart, rides round the outside against the bore, and is squeezed out where they mesh again.</div>`);
  add(`<div style="position:absolute;left:1246px;top:272px;width:14px;height:14px;background:${C.blue}"></div><div class="cp" style="left:1270px;top:273px">INLET · 0 BAR</div>`);
  add(`<div style="position:absolute;left:1246px;top:298px;width:14px;height:14px;background:${C.accent}"></div>`);
  const outLbl = add(`<div class="cp" style="left:1270px;top:299px"></div>`);
  add(`<div class="cp mu" style="left:1246px;top:332px">CONTACT RATIO ${contactRatio.toFixed(2)} · CENTRE DISTANCE ${P.m * P.z} MM</div>`);

  // buttons: views, cutaway, pause
  const btn = {};
  add(`<div class="pn" style="left:1150px;top:730px;width:410px;height:140px"></div>`);
  add(`<div class="cp mu" style="left:1166px;top:742px">VIEW</div>`);
  CAMS.forEach((k, i) => (btn[k] = add(`<div class="tb" style="left:${1166 + i * 76}px;top:762px;width:70px">${k}</div>`)));
  add(`<div class="cp mu" style="left:1166px;top:802px">CUTAWAY</div>`);
  CUTS.forEach((k, i) => (btn[k] = add(`<div class="tb" style="left:${1166 + i * 76}px;top:822px;width:70px">${k}</div>`)));
  btn.pause = add(`<div class="tb" style="left:1470px;top:822px;width:74px">pause</div>`);

  // sliders: shaft speed and outlet pressure
  add(`<div class="pn" style="left:40px;top:730px;width:400px;height:140px"></div>`);
  const slider = (y, label) => {
    add(`<div class="cp mu" style="left:56px;top:${y}px">${label}</div>`);
    add(`<div style="position:absolute;left:66px;top:${y + 34}px;width:340px;height:3px;background:${C.line}"></div>`);
    const fill = add(`<div style="position:absolute;left:66px;top:${y + 34}px;height:3px;background:${C.accent}"></div>`);
    const knob = add(`<div style="position:absolute;top:${y + 25}px;width:20px;height:20px;margin-left:-10px;border-radius:50%;background:${C.paper};border:2px solid ${C.ink}"></div>`);
    const at = (k) => [66 + 340 * Math.min(1, Math.max(0, k)), y + 35];
    return {fill, knob, at};
  };
  const sSpeed = slider(742, `SHAFT SPEED · 0–${RPM_MAX} RPM`);
  const sLoad = slider(802, `OUTLET PRESSURE · 0–${BAR_MAX} BAR`);
  const centre = (n) => [parseFloat(n.style.left) + parseFloat(n.style.width) / 2, parseFloat(n.style.top) + 15];
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));

  // callouts with leaders into the pump
  const svg = add(`<svg style="position:absolute;left:0;top:0" width="1600" height="900"></svg>`);
  const calls = [0, 1, 2].map(() => add(`<div class="call"><b></b><span></span></div>`));

  const cur = add(`<svg class="cur" width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7 16 L11 24 L14 23 L10 15 L17 15 Z" fill="#f2f3f5" stroke="#0d0f12" stroke-width="1.6" stroke-linejoin="round"/></svg>`);
  const ring = add(`<div class="ring"></div>`);

  const paint = (n, on) => {
    n.style.background = on ? C.ink : C.paper;
    n.style.color = on ? C.paper : C.ink;
    n.style.borderColor = on ? C.ink : C.line;
  };
  const setSlider = (s, k) => {
    const [x] = s.at(k);
    s.knob.style.left = `${x}px`;
    s.fill.style.width = `${x - 66}px`;
  };
  // s: {deg, rpm, bar, flow, torque, power, cam, cut, paused, callouts: [{name, sub, at, label, o}], cursor}
  const update = (s) => {
    flow.textContent = s.flow.toFixed(1);
    bar.textContent = `${Math.round(s.bar)} bar`;
    rpm.textContent = `${Math.round(s.rpm)}`;
    tq.textContent = `${s.torque.toFixed(1)} N·m`;
    pw.textContent = `${s.power.toFixed(2)} kW`;
    outLbl.textContent = `OUTLET · ${Math.round(s.bar)} BAR`;
    const a = ((s.deg % 90) + 90) % 90;
    mk.setAttribute('x1', X(a));
    mk.setAttribute('x2', X(a));
    dot.setAttribute('cx', X(a));
    dot.setAttribute('cy', Y(flowAt(a, 1000)));
    setSlider(sSpeed, s.rpm / RPM_MAX);
    setSlider(sLoad, s.bar / BAR_MAX);
    for (const c of CAMS) paint(btn[c], c === s.cam);
    for (const c of CUTS) paint(btn[c], c === s.cut);
    paint(btn.pause, s.paused);
    let lines = '';
    calls.forEach((n, i) => {
      const co = s.callouts[i];
      const show = co && co.at && co.o > 0.01;
      n.style.opacity = show ? co.o : 0;
      if (!show) return;
      const [lx, ly] = co.label;
      n.style.left = `${lx}px`;
      n.style.top = `${ly - 10}px`;
      n.querySelector('b').textContent = co.name;
      n.querySelector('span').textContent = co.sub;
      // the leader leaves from the side of the label that faces its part
      const right = co.at[0] > lx + 60;
      const x0 = right ? lx + n.offsetWidth + 8 : lx - 8;
      const x1 = right ? x0 + 28 : x0 - 28;
      lines += `<g opacity="${co.o}"><polyline points="${x0},${ly} ${x1},${ly} ${co.at[0]},${co.at[1]}" fill="none" stroke="${C.ink}" stroke-width="1"/><circle cx="${co.at[0]}" cy="${co.at[1]}" r="3.5" fill="${C.ink}"/></g>`;
    });
    svg.innerHTML = lines;
    const c = s.cursor;
    cur.style.transform = `translate(${c.x - 2}px, ${c.y - 2}px) scale(${c.press ? 0.86 : 1})`;
    ring.style.opacity = c.ring;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.transform = `scale(${1.6 - 0.6 * c.ring})`;
  };
  return {root, btn, spots, speedKnob: sSpeed.at, loadKnob: sLoad.at, update};
}

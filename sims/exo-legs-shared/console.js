// The overlay: a fixed 1600 x 900 CSS layout. Title top left; the gait (phase, event, speed, cadence, stride) and the
// left leg's joints (angles, actuator torques, the hip and knee curves over a cycle) down the left; the project details
// and the bill of materials down the right; speed and assistance sliders bottom left; view and mode buttons bottom
// right; callouts with leaders; the operator's cursor. update(s) redraws every live part from the frame's state.
import {anglesAt, SPEC, stride, USER} from './kin.js';
import {ACCENT, PARTS, TOTAL_MASS} from './machine.js';

export const C = {ink: '#e7e9ec', mute: '#8f959d', faint: '#4a5059', line: '#2b3037', panel: 'rgba(21,24,29,.92)', paper: '#15181d', accent: ACCENT, blue: '#4f9cf0'};
export const CAMS = ['hero', 'side', 'front', 'knee', 'back'];
export const MODES = ['walk', 'explode'];
export const V_MIN = 0.2;
export const V_MAX = SPEC.vMax;
const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;left:0;top:0;width:1600px;height:900px;pointer-events:none}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 3px rgba(0,0,0,.35)}
.cp{position:absolute;font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;white-space:nowrap}
.mu{color:${C.mute}}
.tb{position:absolute;height:30px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;border:1px solid ${C.line};background:${C.paper};color:${C.ink}}
.big{position:absolute;font-weight:800;letter-spacing:-1.2px;line-height:1}
.row{position:absolute;left:0;right:0;display:flex;justify-content:space-between;font-size:12px;white-space:nowrap}
.row span{color:${C.mute};letter-spacing:.6px}
.call{position:absolute;white-space:nowrap}
.call b{display:block;font-size:14px;font-weight:600}
.call span{display:block;font-size:10.5px;font-weight:500;letter-spacing:1.2px;color:${C.mute};text-transform:uppercase;margin-top:3px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}
.ring{position:absolute;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:2px solid ${C.accent};opacity:0;z-index:49}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};

export function createConsole(app, {title = 'Exoskeleton'} = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = el(`<div class="ui"></div>`);
  app.appendChild(root);
  const add = (h) => root.appendChild(el(h));

  // title
  add(`<div style="position:absolute;left:40px;top:34px;width:48px;height:3px;background:${C.accent}"></div>`);
  add(`<div style="position:absolute;left:40px;top:46px;font-size:32px;font-weight:700;letter-spacing:-.3px">${title}</div>`);
  add(`<div class="cp mu" style="left:40px;top:90px">POWERED HIP-KNEE · ${SPEC.actuators} ACTUATORS · DESIGN STUDY</div>`);

  // gait
  add(`<div class="pn" style="left:40px;top:122px;width:340px;height:176px"></div>`);
  add(`<div class="cp" style="left:56px;top:136px">GAIT · LEFT LEG</div>`);
  const phase = add(`<div class="big" style="left:54px;top:156px;font-size:46px;color:${C.accent}"></div>`);
  const event = add(`<div class="cp" style="left:178px;top:170px;font-size:12px"></div>`);
  const stance = add(`<div class="cp mu" style="left:178px;top:190px"></div>`);
  const gaitRows = add(`<div style="position:absolute;left:56px;top:222px;width:308px;height:66px"></div>`);

  // joints
  add(`<div class="pn" style="left:40px;top:308px;width:340px;height:330px"></div>`);
  add(`<div class="cp" style="left:56px;top:322px">JOINTS · LEFT LEG</div>`);
  const joints = add(`<div style="position:absolute;left:56px;top:346px;width:308px;height:120px"></div>`);
  add(`<div class="cp mu" style="left:56px;top:470px">ANGLE OVER ONE CYCLE</div>`);
  const W = 308;
  const H = 120;
  const X = (p) => p * W;
  const Y = (deg) => 8 + ((70 - deg) / 90) * (H - 16);
  const chart = add(`<svg style="position:absolute;left:56px;top:492px" width="${W}" height="${H}">
    <line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.faint}" stroke-dasharray="3 3"/>
    <line x1="${X(0.62)}" x2="${X(0.62)}" y1="0" y2="${H}" stroke="${C.faint}"/>
    <polyline class="h" points="" fill="none" stroke="${C.blue}" stroke-width="1.6"/>
    <polyline class="k" points="" fill="none" stroke="${C.ink}" stroke-width="1.6"/>
    <line class="mk" y1="0" y2="${H}" stroke="${C.accent}" stroke-width="1.5"/></svg>`);
  add(`<div class="cp" style="left:56px;top:616px;color:${C.blue}">— HIP</div><div class="cp" style="left:118px;top:616px">— KNEE</div><div class="cp mu" style="left:190px;top:616px">STANCE | SWING</div>`);
  const mk = chart.querySelector('.mk');
  const hLine = chart.querySelector('.h');
  const kLine = chart.querySelector('.k');
  let curvesFor = -1;

  // project details
  add(`<div class="pn" style="left:1220px;top:122px;width:340px;height:262px"></div>`);
  add(`<div class="cp" style="left:1236px;top:136px">PROJECT DETAILS</div>`);
  const spec = [
    ['User height', `${Math.round(SPEC.heightRange[0] * 100)}–${Math.round(SPEC.heightRange[1] * 100)} cm`],
    ['User mass (max)', `${SPEC.maxUser} kg`],
    ['Exoskeleton mass', `${TOTAL_MASS.toFixed(1)} kg`],
    ['Actuators', `${SPEC.actuators} × BLDC, harmonic 1:${SPEC.gear}`],
    ['Peak joint torque', `${SPEC.peakTorque} N·m (target)`],
    ['Battery', `${SPEC.battery.V} V Li-ion, ${SPEC.battery.Wh} Wh`],
    ['End stops hip / knee', `${SPEC.stops.hip.join('…')}° / ${SPEC.stops.knee.join('…')}°`],
    ['Top speed', `${(SPEC.vMax * 3.6).toFixed(1)} km/h`],
    ['Sensors', 'encoders, IMU, foot switches'],
  ];
  spec.forEach(([k, v], i) => add(`<div class="row" style="left:1236px;right:${1600 - 1544}px;top:${162 + i * 22}px"><span>${k}</span><b style="font-weight:600">${v}</b></div>`));
  const runtime = add(`<div class="cp" style="left:1236px;top:362px;color:${C.accent}"></div>`);

  // bill of materials
  add(`<div class="pn" style="left:1220px;top:392px;width:340px;height:300px"></div>`);
  add(`<div class="cp" style="left:1236px;top:406px">BILL OF MATERIALS</div>`);
  const bomRows = PARTS.map((p, i) => add(`<div class="row" style="left:1236px;right:${1600 - 1544}px;top:${430 + i * 23}px"><span><b style="color:${C.ink};font-weight:600">${String(i + 1).padStart(2, '0')}</b>&nbsp; ${p.name}${p.qty > 1 ? ` ×${p.qty}` : ''}</span><b style="font-weight:600">${(p.qty * p.mass).toFixed(2)} kg</b></div>`));
  add(`<div class="row" style="left:1236px;right:${1600 - 1544}px;top:${434 + PARTS.length * 23}px;border-top:1px solid ${C.line};padding-top:6px"><span>TOTAL</span><b>${TOTAL_MASS.toFixed(2)} kg</b></div>`);

  // buttons: views, mode, pause
  const btn = {};
  add(`<div class="pn" style="left:1150px;top:730px;width:410px;height:140px"></div>`);
  add(`<div class="cp mu" style="left:1166px;top:742px">VIEW</div>`);
  CAMS.forEach((k, i) => (btn[k] = add(`<div class="tb" style="left:${1166 + i * 76}px;top:762px;width:70px">${k}</div>`)));
  add(`<div class="cp mu" style="left:1166px;top:802px">MODE</div>`);
  MODES.forEach((k, i) => (btn[k] = add(`<div class="tb" style="left:${1166 + i * 100}px;top:822px;width:94px">${k}</div>`)));
  btn.pause = add(`<div class="tb" style="left:1470px;top:822px;width:74px">pause</div>`);

  // sliders: walking speed and assistance
  add(`<div class="pn" style="left:40px;top:730px;width:400px;height:140px"></div>`);
  const slider = (y, label) => {
    const lbl = add(`<div class="cp mu" style="left:56px;top:${y}px">${label}</div>`);
    add(`<div style="position:absolute;left:66px;top:${y + 34}px;width:340px;height:3px;background:${C.line}"></div>`);
    const fill = add(`<div style="position:absolute;left:66px;top:${y + 34}px;height:3px;background:${C.accent}"></div>`);
    const knob = add(`<div style="position:absolute;top:${y + 25}px;width:20px;height:20px;margin-left:-10px;border-radius:50%;background:${C.paper};border:2px solid ${C.ink}"></div>`);
    const at = (k) => [66 + 340 * Math.min(1, Math.max(0, k)), y + 35];
    return {fill, knob, at, lbl};
  };
  const sSpeed = slider(742, '');
  const sAssist = slider(802, '');
  add(`<div class="cp mu" style="left:470px;top:858px;font-size:10px;letter-spacing:1.2px">DESIGN STUDY · NOT A CERTIFIED MEDICAL DEVICE · NEEDS ISO 14971 / ISO 13482 RISK WORK AND CLINICAL TESTING BEFORE USE</div>`);

  const centre = (n) => [parseFloat(n.style.left) + parseFloat(n.style.width) / 2, parseFloat(n.style.top) + 15];
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));
  const svg = add(`<svg style="position:absolute;left:0;top:0" width="1600" height="900"></svg>`);
  const calls = Array.from({length: 8}, () => add(`<div class="call"><b></b><span></span></div>`));
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
  const rows = (items) => items.map(([k, v], i) => `<div class="row" style="top:${i * 22}px"><span>${k}</span><b style="font-weight:600">${v}</b></div>`).join('');
  // s: {phase, event, stance, v, cadence, assist, angles, torque, power, draw, cam, mode, paused, explode, callouts, cursor}
  const update = (s) => {
    phase.textContent = `${Math.round(s.phase * 100)}%`;
    event.textContent = s.event;
    stance.textContent = s.stance ? 'STANCE · FOOT ON GROUND' : 'SWING · FOOT IN AIR';
    gaitRows.innerHTML = rows([
      ['Walking speed', `${s.v.toFixed(2)} m/s · ${(s.v * 3.6).toFixed(1)} km/h`],
      ['Cadence · stride', `${Math.round(s.cadence)} steps/min · ${stride(s.v).toFixed(2)} m`],
      ['User', `${USER.H.toFixed(2)} m · ${USER.mass} kg`],
    ]);
    joints.innerHTML = rows([
      ['Hip · knee · ankle', `${s.angles.hip.toFixed(0)}° · ${s.angles.knee.toFixed(0)}° · ${s.angles.ankle.toFixed(0)}°`],
      ['Hip actuator torque', `${s.torque.hip.toFixed(1)} N·m`],
      ['Knee actuator torque', `${s.torque.knee.toFixed(1)} N·m`],
      ['Hip · knee power', `${s.power.hip.toFixed(0)} W · ${s.power.knee.toFixed(0)} W`],
      ['Assistance', `${Math.round(s.assist * 100)} % of the user's moments`],
    ]);
    // the curves follow the walking speed; redraw only when it moves
    const vk = Math.round(s.v * 50);
    if (vk !== curvesFor) {
      curvesFor = vk;
      const pts = (key) => Array.from({length: 101}, (_, i) => `${X(i / 100).toFixed(1)},${Y(anglesAt(i / 100, s.v)[key]).toFixed(1)}`).join(' ');
      hLine.setAttribute('points', pts('hip'));
      kLine.setAttribute('points', pts('knee'));
    }
    mk.setAttribute('x1', X(s.phase));
    mk.setAttribute('x2', X(s.phase));
    runtime.textContent = `DRAW ${Math.round(s.draw.W)} W · RUNTIME ≈ ${s.draw.hours.toFixed(1)} H`;
    bomRows.forEach((r, i) => (r.style.color = s.highlight === PARTS[i].id ? C.accent : ''));
    sSpeed.lbl.textContent = `WALKING SPEED · ${s.v.toFixed(2)} M/S`;
    sAssist.lbl.textContent = `ASSISTANCE · ${Math.round(s.assist * 100)} %`;
    setSlider(sSpeed, (s.v - V_MIN) / (V_MAX - V_MIN));
    setSlider(sAssist, s.assist);
    for (const c of CAMS) paint(btn[c], c === s.cam);
    for (const m of MODES) paint(btn[m], m === s.mode);
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
      const right = co.at[0] > lx + 60;
      const x0 = right ? lx + n.offsetWidth + 8 : lx - 8;
      const x1 = right ? x0 + 24 : x0 - 24;
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
  return {root, btn, spots, speedKnob: sSpeed.at, assistKnob: sAssist.at, update};
}

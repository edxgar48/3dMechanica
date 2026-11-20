// The overlay: a fixed 1600 x 900 CSS layout. Title top left, the arm's angle against the command and the steps lost
// under it, the three phase currents over the last two seconds, the target, current and load sliders bottom left; the
// electrical angle (field against rotor) top right, how the active drive mode works, the torque it has against the
// torque the load asks for, the view, cutaway and drive buttons bottom right; callouts with leaders into the motor and
// the operator's cursor. update(s) redraws every live part from the frame's state; every number comes from kin.js.
import {P, perRev, pp, resolution, STEPS_REV} from './kin.js';
import {ACCENT, SOUTH} from './machine.js';

export const C = {ink: '#e7e9ec', mute: '#8f959d', faint: '#4a5059', line: '#2b3037', panel: 'rgba(21,24,29,.92)', paper: '#15181d', accent: ACCENT, blue: SOUTH};
export const CAMS = ['hero', 'front', 'stator', 'encoder', 'side'];
export const CAM_LABEL = {hero: 'geral', front: 'frente', stator: 'estator', encoder: 'encoder', side: 'lado'};
export const CUTS = ['solid', 'xray', 'explode'];
export const CUT_LABEL = {solid: 'sólido', xray: 'raio-x', explode: 'explodir'};
export const MODES = ['full', 'micro', 'foc'];
export const MODE_LABEL = {full: 'passo', micro: '1/16', foc: 'foc'};
export const ANG = [-180, 180];
export const AMP_MAX = 1.5;
export const G_MAX = 400;
export const TRACE_S = 2;
const HOW = {
  full: 'Passo cheio, malha aberta: o driver gira o campo 60° elétricos por passo (6 por volta elétrica, 42 por volta). O rotor pula de passo em passo e balança, sem que o driver saiba onde ele está.',
  micro: `Micropasso 1/${P.micro}, malha aberta: correntes senoidais giram o campo em ${60 / P.micro}° elétricos, ${STEPS_REV * P.micro} por volta. O movimento é suave, mas a carga ainda atrasa o rotor e o driver não vê.`,
  foc: 'FOC em malha fechada: o encoder lê o ângulo do rotor 10 mil vezes por segundo e o campo é posto sempre 90° elétricos à frente, com só a corrente que a carga pede. Não perde passo.',
};
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
const fmt = (v, n = 1) => (Math.abs(v) < 0.5 * 10 ** -n ? 0 : v).toFixed(n);

export function createConsole(app, {title = 'BLDC como motor de passo'} = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = el(`<div class="ui"></div>`);
  app.appendChild(root);
  const add = (h) => root.appendChild(el(h));

  // title
  add(`<div style="position:absolute;left:40px;top:38px;width:48px;height:3px;background:${C.accent}"></div>`);
  add(`<div style="position:absolute;left:40px;top:52px;font-size:34px;font-weight:700;letter-spacing:-.3px">${title}</div>`);
  add(`<div class="cp mu" style="left:40px;top:98px">GIMBAL ${P.slots}N${P.poles}P · ${pp} PARES DE POLOS · ${STEPS_REV} PASSOS/VOLTA · AS5600</div>`);

  // the arm against the command
  add(`<div class="pn" style="left:40px;top:140px;width:330px;height:250px"></div>`);
  add(`<div class="cp" style="left:56px;top:156px">ÂNGULO DO BRAÇO</div>`);
  const ang = add(`<div class="big" style="left:54px;top:176px;font-size:52px;color:${C.accent}"></div>`);
  add(`<div class="cp mu" style="left:56px;top:234px">GRAUS · 0° = PENDURADO</div>`);
  add(`<div class="cp" style="left:56px;top:262px">COMANDO</div>`);
  const cmd = add(`<div class="big" style="left:56px;top:282px;font-size:28px"></div>`);
  add(`<div class="cp" style="left:206px;top:262px">ERRO</div>`);
  const err = add(`<div class="big" style="left:206px;top:282px;font-size:28px"></div>`);
  add(`<div class="cp" style="left:56px;top:322px">PASSOS PERDIDOS</div>`);
  const lost = add(`<div class="big" style="left:56px;top:342px;font-size:28px"></div>`);
  add(`<div class="cp" style="left:206px;top:322px">RESOLUÇÃO</div>`);
  const res = add(`<div class="big" style="left:206px;top:342px;font-size:28px"></div>`);
  const resSub = add(`<div class="cp mu" style="left:206px;top:372px"></div>`);

  // phase currents over the last two seconds
  add(`<div class="pn" style="left:40px;top:400px;width:330px;height:236px"></div>`);
  add(`<div class="cp" style="left:56px;top:414px">CORRENTES DE FASE · ÚLTIMOS ${TRACE_S} S</div>`);
  const PH = [C.ink, C.blue, C.accent];
  ['A', 'B', 'C'].forEach((n, i) => {
    add(`<div style="position:absolute;left:${56 + i * 54}px;top:610px;width:14px;height:3px;background:${PH[i]}"></div>`);
    add(`<div class="cp" style="left:${76 + i * 54}px;top:604px">${n}</div>`);
  });
  const amps = add(`<div class="cp mu" style="left:230px;top:604px"></div>`);
  const W = 298;
  const H = 150;
  const Y = (i) => H / 2 - (i / AMP_MAX) * (H / 2 - 6);
  const chart = add(`<svg style="position:absolute;left:56px;top:442px" width="${W}" height="${H}">
    <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="${C.faint}" stroke-dasharray="3 3"/>
    ${PH.map((c) => `<polyline fill="none" stroke="${c}" stroke-width="1.5"/>`).join('')}</svg>`);
  const lines = [...chart.querySelectorAll('polyline')];

  // the electrical angle: where the field points against where the rotor's magnets are
  add(`<div class="pn" style="left:1230px;top:140px;width:330px;height:236px"></div>`);
  add(`<div class="cp" style="left:1246px;top:156px">ÂNGULO ELÉTRICO</div>`);
  const DX = 1320;
  const DY = 270;
  const DR = 70;
  const dial = add(`<svg style="position:absolute;left:${DX - DR - 10}px;top:${DY - DR - 10}px" width="${2 * DR + 20}" height="${2 * DR + 20}">
    <circle cx="${DR + 10}" cy="${DR + 10}" r="${DR}" fill="none" stroke="${C.line}" stroke-width="1.5"/>
    <path class="arc" fill="${C.accent}" fill-opacity=".18" stroke="none"/>
    <line class="ro" x1="${DR + 10}" y1="${DR + 10}" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>
    <line class="fi" x1="${DR + 10}" y1="${DR + 10}" stroke="${C.accent}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${DR + 10}" cy="${DR + 10}" r="4" fill="${C.ink}"/></svg>`);
  const [arc, ro, fi] = ['.arc', '.ro', '.fi'].map((q) => dial.querySelector(q));
  add(`<div style="position:absolute;left:1418px;top:196px;width:14px;height:3px;background:${C.accent}"></div>`);
  add(`<div class="cp" style="left:1438px;top:190px">CAMPO</div>`);
  add(`<div style="position:absolute;left:1418px;top:220px;width:14px;height:3px;background:${C.ink}"></div>`);
  add(`<div class="cp" style="left:1438px;top:214px">ROTOR</div>`);
  add(`<div class="cp mu" style="left:1418px;top:252px">CARGA δ</div>`);
  const delta = add(`<div class="big" style="left:1418px;top:272px;font-size:28px"></div>`);
  add(`<div class="cp mu" style="left:1418px;top:312px">T = KT·I·SEN δ</div>`);
  add(`<div class="cp mu" style="left:1246px;top:352px">EM GRAUS ELÉTRICOS · ${pp}× O ÂNGULO DO EIXO</div>`);

  // how the active mode works
  add(`<div class="pn" style="left:1230px;top:386px;width:330px;height:150px"></div>`);
  const howT = add(`<div class="cp" style="left:1246px;top:402px"></div>`);
  const how = add(`<div style="position:absolute;left:1246px;top:426px;width:300px;font-size:13px;line-height:1.5;color:${C.ink}"></div>`);

  // torque: what the drive has against what the load asks
  add(`<div class="pn" style="left:1230px;top:546px;width:330px;height:104px"></div>`);
  add(`<div class="cp" style="left:1246px;top:560px">TORQUE · N·M</div>`);
  const loss = add(`<div class="cp mu" style="left:1400px;top:560px;width:144px;text-align:right"></div>`);
  const TQ = 0.5;
  const bar = (y, label, col) => {
    add(`<div class="cp mu" style="left:1246px;top:${y}px">${label}</div>`);
    add(`<div style="position:absolute;left:1340px;top:${y + 2}px;width:150px;height:8px;background:${C.line}"></div>`);
    const f = add(`<div style="position:absolute;left:1340px;top:${y + 2}px;height:8px;background:${col}"></div>`);
    const v = add(`<div class="cp" style="left:1500px;top:${y}px"></div>`);
    return (x) => {
      f.style.width = `${150 * Math.min(1, Math.abs(x) / TQ)}px`;
      v.textContent = fmt(Math.abs(x), 2);
    };
  };
  const barHold = bar(588, 'MÁXIMO', C.ink);
  const barLoad = bar(614, 'CARGA', C.accent);

  // buttons: views, cutaway, drive mode, pause
  const btn = {};
  add(`<div class="pn" style="left:1150px;top:664px;width:410px;height:206px"></div>`);
  add(`<div class="cp mu" style="left:1166px;top:676px">VISTA</div>`);
  CAMS.forEach((k, i) => (btn[k] = add(`<div class="tb" style="left:${1166 + i * 76}px;top:696px;width:70px">${CAM_LABEL[k]}</div>`)));
  add(`<div class="cp mu" style="left:1166px;top:736px">CORTE</div>`);
  CUTS.forEach((k, i) => (btn[k] = add(`<div class="tb" style="left:${1166 + i * 76}px;top:756px;width:70px">${CUT_LABEL[k]}</div>`)));
  add(`<div class="cp mu" style="left:1166px;top:796px">ACIONAMENTO</div>`);
  MODES.forEach((k, i) => (btn[k] = add(`<div class="tb" style="left:${1166 + i * 76}px;top:816px;width:70px">${MODE_LABEL[k]}</div>`)));
  btn.pause = add(`<div class="tb" style="left:1470px;top:816px;width:74px">pausa</div>`);

  // sliders: target angle, current, load
  add(`<div class="pn" style="left:40px;top:664px;width:400px;height:206px"></div>`);
  const slider = (y, label) => {
    add(`<div class="cp mu" style="left:56px;top:${y}px">${label}</div>`);
    const val = add(`<div class="cp" style="left:280px;top:${y}px;width:140px;text-align:right"></div>`);
    add(`<div style="position:absolute;left:66px;top:${y + 34}px;width:340px;height:3px;background:${C.line}"></div>`);
    const fill = add(`<div style="position:absolute;left:66px;top:${y + 34}px;height:3px;background:${C.accent}"></div>`);
    const knob = add(`<div style="position:absolute;top:${y + 25}px;width:20px;height:20px;margin-left:-10px;border-radius:50%;background:${C.paper};border:2px solid ${C.ink}"></div>`);
    const at = (k) => [66 + 340 * Math.min(1, Math.max(0, k)), y + 35];
    return {fill, knob, at, val};
  };
  const sAng = slider(676, `ALVO · ${ANG[0]}° A +${ANG[1]}°`);
  const sAmp = slider(740, `CORRENTE MÁXIMA · 0–${AMP_MAX} A`);
  const sLoad = slider(804, `PESO NO BRAÇO · 0–${G_MAX} G A ${P.armL * 1000} MM`);
  const centre = (n) => [parseFloat(n.style.left) + parseFloat(n.style.width) / 2, parseFloat(n.style.top) + 15];
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));

  // callouts with leaders into the motor
  const svg = add(`<svg style="position:absolute;left:0;top:0" width="1600" height="900"></svg>`);
  const calls = [0, 1, 2].map(() => add(`<div class="call"><b></b><span></span></div>`));

  const cur = add(`<svg class="cur" width="22" height="26" viewBox="0 0 22 26"><path d="M2 2 L2 21 L7 16 L11 24 L14 23 L10 15 L17 15 Z" fill="#f2f3f5" stroke="#0d0f12" stroke-width="1.6" stroke-linejoin="round"/></svg>`);
  const ring = add(`<div class="ring"></div>`);

  const paint = (n, on) => {
    n.style.background = on ? C.ink : C.paper;
    n.style.color = on ? C.paper : C.ink;
    n.style.borderColor = on ? C.ink : C.line;
  };
  const setSlider = (s, k, text) => {
    const [x] = s.at(k);
    s.knob.style.left = `${x}px`;
    s.fill.style.width = `${x - 66}px`;
    s.val.textContent = text;
  };
  const tip = (a, r) => [DR + 10 + r * Math.sin(a), DR + 10 - r * Math.cos(a)];
  // s: {r (kin.js readout), target, imax, grams, mode, cam, cut, paused, trace: [[ia, ib, ic]...], callouts, cursor}
  const update = (s) => {
    const r = s.r;
    ang.textContent = `${fmt(r.deg)}°`;
    cmd.textContent = `${fmt(r.cmd)}°`;
    err.textContent = `${fmt(r.err)}°`;
    err.style.color = Math.abs(r.err) > 2 ? C.accent : C.ink;
    lost.textContent = `${r.lost}`;
    lost.style.color = r.lost !== 0 ? C.accent : C.ink;
    res.textContent = `${resolution(s.mode).toFixed(s.mode === 'full' ? 2 : 3)}°`;
    resSub.textContent = s.mode === 'foc' ? `${perRev(s.mode)} CONT./VOLTA` : `${perRev(s.mode)} PASSOS/VOLTA`;
    // phase chart, newest on the right
    const n = s.trace.length;
    for (let p = 0; p < 3; p++) lines[p].setAttribute('points', s.trace.map((v, i) => `${((i / Math.max(1, n - 1)) * W).toFixed(1)},${Y(v[p]).toFixed(1)}`).join(' '));
    amps.textContent = `±${AMP_MAX} A · I = ${r.I.toFixed(2)} A`;
    // electrical dial: rotor d axis and field, both in electrical degrees
    const [rx, ry] = tip(r.re, DR - 8);
    const [fx, fy] = tip(r.fe, DR - 8);
    ro.setAttribute('x2', rx);
    ro.setAttribute('y2', ry);
    fi.setAttribute('x2', fx);
    fi.setAttribute('y2', fy);
    const d = (r.delta * Math.PI) / 180;
    const [ax, ay] = tip(r.re, DR - 22);
    const [bx, by] = tip(r.re + d, DR - 22);
    arc.setAttribute('d', `M${DR + 10},${DR + 10} L${ax},${ay} A${DR - 22},${DR - 22} 0 0 ${d > 0 ? 1 : 0} ${bx},${by} Z`);
    delta.textContent = `${Math.round(r.delta)}°`;
    howT.textContent = s.mode === 'full' ? 'PASSO CHEIO · MALHA ABERTA' : s.mode === 'micro' ? 'MICROPASSO · MALHA ABERTA' : 'FOC · MALHA FECHADA';
    how.textContent = HOW[s.mode];
    barHold(r.hold);
    barLoad(r.load);
    loss.textContent = `COBRE ${r.loss.toFixed(1)} W`;
    setSlider(sAng, (s.target - ANG[0]) / (ANG[1] - ANG[0]), `${Math.round(s.target)}°`);
    setSlider(sAmp, s.imax / AMP_MAX, `${s.imax.toFixed(2)} A`);
    setSlider(sLoad, s.grams / G_MAX, `${Math.round(s.grams)} G`);
    for (const c of CAMS) paint(btn[c], c === s.cam);
    for (const c of CUTS) paint(btn[c], c === s.cut);
    for (const c of MODES) paint(btn[c], c === s.mode);
    paint(btn.pause, s.paused);
    let svgs = '';
    calls.forEach((node, i) => {
      const co = s.callouts[i];
      const show = co && co.at && co.o > 0.01;
      node.style.opacity = show ? co.o : 0;
      if (!show) return;
      const [lx, ly] = co.label;
      node.style.left = `${lx}px`;
      node.style.top = `${ly - 10}px`;
      node.querySelector('b').textContent = co.name;
      node.querySelector('span').textContent = co.sub;
      const right = co.at[0] > lx + 60;
      const x0 = right ? lx + node.offsetWidth + 8 : lx - 8;
      const x1 = right ? x0 + 28 : x0 - 28;
      svgs += `<g opacity="${co.o}"><polyline points="${x0},${ly} ${x1},${ly} ${co.at[0]},${co.at[1]}" fill="none" stroke="${C.ink}" stroke-width="1"/><circle cx="${co.at[0]}" cy="${co.at[1]}" r="3.5" fill="${C.ink}"/></g>`;
    });
    svg.innerHTML = svgs;
    const c = s.cursor;
    cur.style.transform = `translate(${c.x - 2}px, ${c.y - 2}px) scale(${c.press ? 0.86 : 1})`;
    ring.style.opacity = c.ring;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.transform = `scale(${1.6 - 0.6 * c.ring})`;
  };
  return {root, btn, spots, angKnob: sAng.at, ampKnob: sAmp.at, loadKnob: sLoad.at, update};
}

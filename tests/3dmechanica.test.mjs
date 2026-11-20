// The skill's own checks: every example and a freshly generated machine build, render without a page error, show the
// machine on frame 0, and run their live page's auto tour; every timeline is the one source of its beats, and the score
// follows it; the review tools work when ffmpeg is there. Everything is written to a temporary folder.
//
//   npm test                     (node --test tests/)
//
// Needs `npm install` and Playwright's Chromium. Python and ffmpeg are optional: their tests skip without them.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {after, before, describe, it} from 'node:test';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {CHROMIUM, CHROMIUM_ARGS, FFMPEG, FFPROBE, PYTHON, playwright} from '../paths.mjs';
import {beatTimes} from '../timeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SIMS = path.join(ROOT, 'sims');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), '3dmechanica-test-'));
const OUT = path.join(TMP, 'out');
const DIST = path.join(OUT, 'dist');
const EXAMPLES = ['v8', 'cessna', 'strandbeest', 'gear-pump', 'exo-legs', 'bldc-stepper'];
const MACHINE = 'test-crank';

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, {encoding: 'utf8', env: {...process.env, MECHANICA3D_OUT: OUT, INIT_CWD: ''}, ...opts});
  return {code: r.error ? -1 : r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, error: r.error};
};
const node = (script, args = [], opts) => run(process.execPath, [path.join(ROOT, script), ...args], opts);
const has = (bin, args) => run(bin, args).code === 0;
const HAS_PYTHON = has(PYTHON, ['--version']);
const HAS_FFMPEG = has(FFMPEG, ['-version']) && has(FFPROBE, ['-version']);
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// every page this suite opens: [label, film folder, live folder]
const MACHINES = [
  ...EXAMPLES.map((m) => [m, path.join(SIMS, `${m}-film`), path.join(SIMS, `${m}-live`), path.join(SIMS, `${m}-shared`)]),
  [MACHINE, path.join(TMP, `${MACHINE}-film`), path.join(TMP, `${MACHINE}-live`), path.join(TMP, `${MACHINE}-shared`)],
];

let browser;
before(() => {
  const made = node('new-machine.mjs', [MACHINE, '--dir', TMP]);
  assert.equal(made.code, 0, made.out);
  const dirs = MACHINES.flatMap(([, film, live]) => [film, live]);
  const built = node('sims/build.mjs', dirs);
  assert.equal(built.code, 0, built.out);
});
after(async () => {
  await browser?.close();
  fs.rmSync(TMP, {recursive: true, force: true});
});
const launch = async () => (browser ??= await playwright().chromium.launch({executablePath: CHROMIUM, args: CHROMIUM_ARGS}));

// opens a built page, returns the page and the errors it logged
async function open(name, {capture}) {
  const page = await (await launch()).newPage({viewport: {width: 1600, height: 900}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  if (capture) await page.addInitScript(() => (window.__CAPTURE = true));
  await page.goto(pathToFileURL(path.join(DIST, `${name}.html`)).href);
  return {page, errors};
}
// share of the 3D canvas that differs from its own top-left corner (the backdrop): 0 for an empty frame
const coverage = (page) =>
  page.evaluate(() => {
    const src = document.getElementById('gl');
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 90;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0, 160, 90);
    const d = g.getImageData(0, 0, 160, 90).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 36) n++;
    return n / (160 * 90);
  });

describe('timelines', () => {
  for (const [name, film, , shared] of MACHINES) {
    it(`${name}: the script is the one source of the beats`, () => {
      const tl = readJSON(path.join(film, 'timeline.json'));
      assert.ok(tl.duration > 0, 'duration');
      assert.ok(Array.isArray(tl.script) && tl.script.length, 'a non-empty script');
      let prev = -Infinity;
      for (const e of tl.script) {
        assert.ok(e.t >= prev && e.t >= 0 && e.t < tl.duration, `move at ${e.t}s is in order and inside the film`);
        assert.ok(Object.keys(e).length > 1, `move at ${e.t}s does something`);
        prev = e.t;
      }
      assert.deepEqual(beatTimes(tl), [...new Set(tl.script.map((e) => e.t))]);
      const filmJs = fs.readFileSync(path.join(shared, 'film.js'), 'utf8');
      assert.match(filmJs, /import TIMELINE from '\.\.\/[\w-]+-film\/timeline\.json'/, 'film.js imports the timeline');
      assert.doesNotMatch(filmJs, /export const SCRIPT = \[/, 'film.js keeps no copy of the script');
    });
  }
});

describe('the generated machine', () => {
  it('its math checks by hand: the swept volume and the stroke', async () => {
    const kin = path.join(TMP, 'kin.mjs');
    fs.copyFileSync(path.join(TMP, `${MACHINE}-shared`, 'kin.js'), kin);
    const {P, displacement, travel, pistonSpeed} = await import(pathToFileURL(kin).href);
    assert.ok(Math.abs(displacement - (Math.PI / 4) * P.bore ** 2 * P.stroke / 1000) < 1e-9);
    assert.ok(Math.abs(travel(0)) < 1e-9, 'no travel at top dead centre');
    assert.ok(Math.abs(travel(180) - P.stroke) < 1e-9, 'the full stroke at bottom dead centre');
    assert.ok(Math.abs(pistonSpeed(0, 3000)) < 1e-6 && pistonSpeed(90, 3000) < 0, 'still at TDC, moving down after it');
  });
  it('new-machine refuses a bad name, an example name and an existing machine', () => {
    for (const args of [['Bad_Name'], ['v8'], [MACHINE, '--dir', TMP]]) {
      const r = node('new-machine.mjs', args);
      assert.equal(r.code, 1, `${args[0]} should be refused:\n${r.out}`);
    }
  });
});

describe('pages', () => {
  for (const [name, film] of MACHINES) {
    const duration = readJSON(path.join(film, 'timeline.json')).duration;
    it(`${name}-film renders the whole film with the machine in frame`, async () => {
      const {page, errors} = await open(`${name}-film`, {capture: true});
      await page.waitForFunction(() => window.SIM?.ready, null, {timeout: 60000});
      assert.equal(await page.evaluate(() => window.SIM.duration), duration, 'the page runs as long as its timeline');
      for (const t of [0, duration * 0.25, duration * 0.5, duration * 0.75, duration - 0.05]) {
        await page.evaluate((x) => window.SIM.render(x), t);
        const k = await coverage(page);
        assert.ok(k > 0.02, `t=${t.toFixed(2)}: only ${(k * 100).toFixed(1)}% of the frame differs from the backdrop`);
      }
      assert.deepEqual(errors, []);
      await page.close();
    });
    it(`${name}-live starts its auto tour and hands over on a click`, async () => {
      const {page, errors} = await open(`${name}-live`, {capture: false});
      await page.waitForFunction(() => window.LIVE, null, {timeout: 60000});
      await page.waitForFunction(() => /AUTO TOUR|TOUR AUTOM/i.test(document.querySelector('.tourchip')?.textContent ?? ''), null, {timeout: 15000});
      await page.waitForTimeout(1200);
      assert.ok((await coverage(page)) > 0.02, 'the machine is on screen');
      await page.mouse.click(800, 450);
      await page.waitForFunction(() => /RESUME|RETOMAR/i.test(document.querySelector('.tourchip')?.textContent ?? ''), null, {timeout: 5000});
      assert.deepEqual(errors, []);
      await page.close();
    });
  }
});

describe('scores', {skip: !HAS_PYTHON && `no Python (${PYTHON})`}, () => {
  const render = (shared, args = []) => {
    const r = run(PYTHON, [path.join(ROOT, 'run_sfx.py'), path.join(shared, 'score.py'), ...args]);
    assert.equal(r.code, 0, r.out);
    const m = r.out.match(/: ([\d.]+)s, (\d+) sounds, (-?[\d.]+) LUFS, true peak (-?[\d.]+) dBFS/);
    assert.ok(m, r.out);
    return {duration: Number(m[1]), sounds: Number(m[2]), lufs: Number(m[3]), peak: Number(m[4])};
  };
  for (const [name, film, , shared] of MACHINES) {
    it(`${name}: mastered on the film's length, and it follows the timeline`, () => {
      const tl = readJSON(path.join(film, 'timeline.json'));
      const s = render(shared, ['--out', path.join(TMP, `${name}.wav`)]);
      assert.equal(s.duration, tl.duration);
      assert.ok(Math.abs(s.lufs + 14) <= 0.3, `${s.lufs} LUFS`);
      assert.ok(s.peak <= -2 + 0.05, `true peak ${s.peak} dBFS`);
      // drop the last move from the script: the score must lose its accents, so no time is typed in score.py
      const cut = path.join(TMP, `${name}-cut.json`);
      fs.writeFileSync(cut, JSON.stringify({...tl, script: tl.script.slice(0, -1)}));
      const c = render(shared, ['--timeline', cut, '--out', path.join(TMP, `${name}-cut.wav`)]);
      assert.ok(c.sounds < s.sounds, `removing the move at ${tl.script.at(-1).t}s left ${c.sounds} of ${s.sounds} sounds`);
    });
  }
});

describe('review tools', {skip: !HAS_FFMPEG && `no ffmpeg (${FFMPEG})`}, () => {
  it('capture --stills beats tiles one frame per beat, without --timeline for a machine outside sims/', () => {
    const sheet = path.join(TMP, 'beats.png');
    const r = node('sims/capture.mjs', [`${MACHINE}-film`, '--size', '800x450', '--dpr', '1', '--stills', 'beats', '--out', sheet]);
    assert.equal(r.code, 0, r.out);
    assert.ok(fs.statSync(sheet).size > 10000, 'a sheet was written');
    const beats = beatTimes(readJSON(path.join(TMP, `${MACHINE}-film`, 'timeline.json')));
    const frames = fs.readdirSync(sheet.replace(/\.png$/, '-frames'));
    assert.equal(frames.length, new Set([0, ...beats.map((t) => (t + 0.3).toFixed(2))].map(Number)).size);
  });
  it('capture writes a video with the frames asked for', () => {
    const mp4 = path.join(TMP, 'clip.mp4');
    const r = node('sims/capture.mjs', ['v8-film', '--size', '640x360', '--dpr', '1', '--fps', '10', '--from', '0', '--to', '1', '--out', mp4]);
    assert.equal(r.code, 0, r.out);
    const p = run(FFPROBE, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,width,height', '-of', 'csv=p=0', mp4]);
    // width, height, frames (some ffprobe versions end the line with a comma)
    assert.deepEqual(p.out.trim().split(',').filter(Boolean).map(Number), [640, 360, 10]);
  });
});

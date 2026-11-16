#!/usr/bin/env node
// Checks everything the skill needs, before a long render finds out halfway: Node, the npm packages, Playwright's
// Chromium and the GPU it gets, ffmpeg and ffprobe, Python. Each line says what it is for and how to fix it.
//
//   node doctor.mjs            all checks (starts a headless Chromium for the GPU, a few seconds)
//   node doctor.mjs --quick    skip the browser
//
// Exit code 1 when something the pages need is missing; video and sound are reported but optional.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CHROMIUM, CHROMIUM_ARGS, DEPS, FFMPEG, FFPROBE, PYTHON, playwright} from './paths.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const quick = process.argv.includes('--quick');
const tty = process.stdout.isTTY;
const paint = (c, s) => (tty ? `\x1b[${c}m${s}\x1b[0m` : s);
const MARK = {ok: paint(32, 'ok  '), warn: paint(33, 'warn'), fail: paint(31, 'FAIL')};
let failed = false;
const report = (level, what, detail, fix) => {
  if (level === 'fail') failed = true;
  console.log(`${MARK[level]}  ${what.padEnd(22)} ${detail}`);
  if (fix && level !== 'ok') console.log(`      ${''.padEnd(22)} → ${fix}`);
};
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, {encoding: 'utf8', shell: false});
  return r.error ? null : `${r.stdout}${r.stderr}`.trim();
};
const setup = `npm install --prefix "${HERE}"  then  node "${path.join(HERE, 'node_modules', 'playwright', 'cli.js')}" install chromium`;

// Node
const [major] = process.versions.node.split('.').map(Number);
report(major >= 20 ? 'ok' : 'fail', 'node', `v${process.versions.node}`, 'install Node.js 20 or newer');

// npm packages
const pkg = JSON.parse(fs.readFileSync(path.join(HERE, 'package.json'), 'utf8'));
const missing = Object.keys(pkg.dependencies).filter((d) => !fs.existsSync(path.join(DEPS, d, 'package.json')));
report(missing.length ? 'fail' : 'ok', 'npm packages', missing.length ? `missing: ${missing.join(', ')}` : `${Object.keys(pkg.dependencies).length} installed in ${DEPS}`, setup);

// Chromium and the GPU it gets
if (!missing.includes('playwright')) {
  const {chromium} = playwright();
  const exe = CHROMIUM || chromium.executablePath();
  if (!fs.existsSync(exe)) report('fail', 'chromium', `not found at ${exe}`, CHROMIUM ? 'fix the CHROMIUM variable' : setup);
  else if (quick) report('ok', 'chromium', `${exe} (GPU not checked: --quick)`);
  else {
    try {
      const browser = await chromium.launch({executablePath: CHROMIUM, args: CHROMIUM_ARGS});
      const page = await browser.newPage();
      const gpu = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return null;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
      await browser.close();
      report('ok', 'chromium', `${browser.version()}`);
      if (!gpu) report('fail', 'webgl2', 'not available in headless Chromium', 'update the GPU driver, or set CHROMIUM to a desktop Chrome');
      else if (/swiftshader|llvmpipe|software|microsoft basic/i.test(gpu))
        report('warn', 'gpu', `${gpu}: a software renderer, captures will be slow`, 'the flags in paths.mjs did not take; update the GPU driver or set CHROMIUM to a desktop Chrome');
      else report('ok', 'gpu', gpu);
    } catch (e) {
      report('fail', 'chromium', `does not start: ${e.message.split('\n')[0]}`, setup);
    }
  }
}

// ffmpeg / ffprobe: video, review sheets, waveforms
for (const [what, bin, env] of [['ffmpeg', FFMPEG, 'FFMPEG'], ['ffprobe', FFPROBE, 'FFPROBE']]) {
  const out = run(bin, ['-version']);
  report(out ? 'ok' : 'warn', what, out ? out.split('\n')[0].replace(/ Copyright.*/, '') : `not found (${bin}): no video, review sheets or waveforms`,
    `install ffmpeg and put it on PATH, or set ${env} to the binary` + (process.platform === 'win32' ? ' (winget install Gyan.FFmpeg)' : ''));
}

// Python: the score
const py = run(PYTHON, ['-c', 'import sys; print(sys.version.split()[0]); sys.exit(sys.version_info < (3, 8))']);
const pyOk = py && /^3\.(\d+)/.test(py) && Number(py.match(/^3\.(\d+)/)[1]) >= 8;
report(pyOk ? 'ok' : 'warn', 'python', pyOk ? `${py} (${PYTHON})` : `not found or older than 3.8 (${PYTHON}): no score`, 'install Python 3.8+ or set PYTHON to the binary');

console.log(failed ? '\nThe pages cannot build or render until the FAIL lines are fixed.' : '\nReady: the pages build and render. A warning only limits video or sound.');
process.exit(failed ? 1 : 0);

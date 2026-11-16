#!/usr/bin/env node
// Starts a new machine from templates/machine: a single-cylinder slider-crank with every piece a machine needs (the
// math, the geometry, the studio, the overlay, the film, the live page with its auto tour, the score), wired to one
// timeline. It builds and runs as it is; then replace the slider-crank with your machine, file by file.
//
//   node new-machine.mjs <name> [--title "Display Title"] [--dir <parent folder>]
//
// Creates <dir>/<name>-shared, <dir>/<name>-film and <dir>/<name>-live (dir defaults to the current folder) and
// prints the commands that build, capture and score it.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, 'templates', 'machine');
const argv = process.argv.slice(2);
const opt = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  if (i === -1) return d;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const title = opt('title');
// `npm run new-machine` runs from the skill's folder; INIT_CWD is where it was typed
const dir = path.resolve(process.env.INIT_CWD || '.', opt('dir', '.'));
const name = argv[0];

if (!name || !/^[a-z][a-z0-9-]*$/.test(name) || /-(shared|film|live)$/.test(name)) {
  console.error('usage: node new-machine.mjs <name> [--title "Display Title"] [--dir <parent folder>]');
  console.error('  <name>: lowercase letters, digits and dashes, starting with a letter (e.g. gear-pump), without -shared/-film/-live');
  process.exit(1);
}
// build.mjs looks in sims/ first, so a name the examples use would build the example instead
if (fs.readdirSync(path.join(HERE, 'sims')).some((d) => d.startsWith(`${name}-`))) {
  console.error(`"${name}" is taken by an example in sims/; pick another name`);
  process.exit(1);
}
const TITLE = title || name.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const fill = (s) => s.replaceAll('__NAME__', name).replaceAll('__TITLE__', TITLE.replace(/[`$\\'"<>]/g, ''));

const folders = fs.readdirSync(TEMPLATE);
const taken = folders.map((f) => path.join(dir, fill(f))).filter((f) => fs.existsSync(f));
if (taken.length) {
  console.error(`already there, nothing written:\n  ${taken.join('\n  ')}`);
  process.exit(1);
}

const copy = (src, dst) => {
  fs.mkdirSync(dst, {recursive: true});
  for (const e of fs.readdirSync(src, {withFileTypes: true})) {
    const from = path.join(src, e.name);
    const to = path.join(dst, fill(e.name));
    if (e.isDirectory()) copy(from, to);
    else fs.writeFileSync(to, fill(fs.readFileSync(from, 'utf8')));
  }
};
for (const f of folders) copy(path.join(TEMPLATE, f), path.join(dir, fill(f)));

const rel = (p) => (path.relative(process.cwd(), p) || '.').replaceAll('\\', '/');
const sk = rel(HERE);
const at = (s) => {
  const r = rel(path.join(dir, s));
  return r.startsWith('.') || path.isAbsolute(r) ? r : `./${r}`;
};
console.log(`${TITLE}: ${at(`${name}-shared`)}, ${at(`${name}-film`)}, ${at(`${name}-live`)}

Build and look:
  node "${sk}/sims/build.mjs" "${at(`${name}-live`)}" "${at(`${name}-film`)}"
  node "${sk}/sims/capture.mjs" ${name}-film --size 1600x900 --dpr 1.2 --stills beats --cols 3
Score:
  python "${sk}/run_sfx.py" "${at(`${name}-shared/score.py`)}"

Then make it yours, in this order: kin.js (the real numbers and the math), machine.js (the parts), console.js (the
readouts), ${name}-film/timeline.json (the operator's moves), score.py (the accents).`);

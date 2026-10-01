// node probe.mjs t1 t2 ... -> out/probe/<t>.png single frames (no blur)
import { chromium } from 'playwright'; import fs from 'fs';
fs.mkdirSync('out/probe', { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
p.on('pageerror', e => console.error('PAGEERR', e.message));
await p.goto('file://' + process.cwd() + '/src/index.html'); await p.evaluate(() => window.ready);
for (const t of process.argv.slice(2)) { await p.evaluate(t => window.seek(t), +t); await p.screenshot({ path: `out/probe/${t}.png` }); }
await b.close();

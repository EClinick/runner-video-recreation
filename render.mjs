// Usage: node render.mjs [start] [end] [sub] -> out/frames/*.jpg, then ffmpeg assembles out/recreation.mp4
import { chromium } from 'playwright';
import fs from 'fs';
const FPS = 24, DUR = 14.677;
const [a = 0, b = DUR, SUB = 1] = process.argv.slice(2).map(Number);
const dir = 'out/frames'; fs.mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files', '--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', e => { console.error('PAGEERR', e.message); process.exit(1); });
page.on('console', m => m.type() === 'error' && console.error('CONSOLE', m.text()));
await page.goto('file://' + process.cwd() + '/src/index.html');
await page.evaluate(() => window.ready);
const f0 = Math.round(a * FPS), f1 = Math.min(Math.round(b * FPS), Math.floor(DUR * FPS));
const t0 = Date.now();
for (let f = f0; f < f1; f++) {
  for (let k = 0; k < SUB; k++) {
    // 180-degree shutter centred on the frame time
    const t = f / FPS + (SUB > 1 ? ((k + 0.5) / SUB - 0.5) * 0.5 / FPS : 0);
    await page.evaluate(t => window.seek(t), Math.max(0, t));
    await page.screenshot({ path: `${dir}/${String(f).padStart(4, '0')}_${k}.jpg`, type: 'jpeg', quality: 94 });
  }
}
console.log(`rendered ${f1 - f0} frames x${SUB} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await browser.close();

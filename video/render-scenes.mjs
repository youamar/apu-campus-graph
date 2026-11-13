// Renders scenes/*.html frame-by-frame (deterministic, 30fps) into clips/*.mp4.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import fs from 'node:fs';

const FPS = 30;
const JOBS = [
  ['s1_hook', 's1_hook.html'],
  ['s2_stats', 's2_stats.html'],
  ['s3_turn', 's3_turn.html'],
  ['s5_end', 's5_end.html'],
  ['t_ask', 'title.html?id=ask'],
  ['t_map', 'title.html?id=map'],
  ['t_star', 'title.html?id=star'],
  ['t_join', 'title.html?id=join'],
  ['t_go', 'title.html?id=go'],
  ['mobile_bg', 'mobile_bg.html'],
];
const only = process.argv.slice(2);
fs.mkdirSync('clips', { recursive: true });
const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

await Promise.all(JOBS.filter(([n]) => !only.length || only.includes(n)).map(() => null));
for (const [name, file] of JOBS) {
  if (only.length && !only.includes(name)) continue;
  const [f, q] = file.split('?');
  const url = pathToFileURL(path.resolve('scenes', f)).href + (q ? '?' + q : '') + '#render';
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const dur = await page.evaluate(() => window.DURATION);
  const n = Math.round(dur * FPS);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS), `clips/${name}.mp4`], { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < n; i++) {
    await page.evaluate((t) => window.__seek(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('rendered', name, dur, 's');
}
await browser.close();

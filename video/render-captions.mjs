// Renders caption pills as transparent 1920x1080 PNGs into clips/cap_*.png
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CAPS = {
  map: { t: '137 real APU communities.', s: 'One living map.' },
  filter: { t: 'Societies · Sports · International', s: 'one tap to filter', c: '#42ba96' },
  gemini: { t: 'Ask APU', s: 'powered by Google Gemini' },
  zoom: { t: 'Gemini zooms the map to your matches', s: '' },
  card: { t: 'Can I join · time commitment · fee · deadline', s: '', c: '#ff8b33' },
  today: { t: 'Happening today', s: 'tap a live event, see who is going', c: '#e04a5a' },
  star: { t: 'Brighter star', s: '= an event is coming up', c: '#ff8b33' },
  go: { t: 'Go together', s: '· see who else is interested', c: '#42ba96' },
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const [k, v] of Object.entries(CAPS)) {
  const q = new URLSearchParams(v).toString();
  await page.goto(pathToFileURL(path.resolve('scenes/caption.html')).href + '?' + q, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `clips/cap_${k}.png`, omitBackground: true });
}
await browser.close();
console.log('captions done');

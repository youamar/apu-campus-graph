// Records real app footage with Playwright. Usage: node record-app.mjs [clipName...]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const URL = 'http://localhost:5173/';
const OUT = path.resolve('raw');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(name, size, fn) {
  if (only.length && !only.includes(name)) return;
  const browser = await chromium.launch({ args: ['--force-color-profile=srgb'] });
  const dir = path.join(OUT, name);
  fs.rmSync(dir, { recursive: true, force: true });
  const ctx = await browser.newContext({
    viewport: size, deviceScaleFactor: 1, colorScheme: 'dark',
    isMobile: size.width < 500, hasTouch: size.width < 500,
    recordVideo: { dir, size },
  });
  const t0 = Date.now();
  const marks = {};
  const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; console.log(name, k, marks[k]); };
  const page = await ctx.newPage();
  try {
    await page.goto(URL, { waitUntil: 'networkidle' });
    await sleep(3500); // let the force layout settle
    await fn(page, mark);
  } catch (e) {
    console.error(name, 'FAILED', e.message);
    marks.error = e.message;
  }
  await page.screenshot({ path: path.join(OUT, `${name}-end.png`) });
  await ctx.close();
  await browser.close();
  const vid = fs.readdirSync(dir).find((f) => f.endsWith('.webm'));
  fs.renameSync(path.join(dir, vid), path.join(OUT, `${name}.webm`));
  fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(marks, null, 2));
}

async function humanType(page, loc, text) {
  await loc.click();
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(ch === ' ' ? 55 + Math.random() * 40 : 25 + Math.random() * 35);
    if (ch === '.') await sleep(220);
  }
}

async function smoothMove(page, x, y, steps = 25) {
  await page.mouse.move(x, y, { steps });
}

async function ask(page, mark, q, label) {
  const input = page.getByLabel('Ask APU a question');
  mark(`${label}_type`);
  await humanType(page, input, q);
  await sleep(400);
  const before = await page.locator('.chat-bubble.user').count();
  mark(`${label}_send`);
  await page.keyboard.press('Enter');
  await page.waitForFunction((n) => document.querySelectorAll('.chat-bubble.user').length > n && !document.querySelector('.chat-typing'), before, { timeout: 60000 });
  await sleep(300);
  mark(`${label}_reply`);
  const offline = await page.locator('.chat-offline').count();
  return offline === 0;
}

const DESK = { width: 1920, height: 1080 };

await session('a_idle', DESK, async (page, mark) => {
  mark('start');
  await smoothMove(page, 700, 500, 60);
  await sleep(4000);
  await smoothMove(page, 900, 420, 60);
  await sleep(4500);
  mark('end');
});

await session('b_filter', DESK, async (page, mark) => {
  mark('start');
  const chip = page.locator('.cg-chip', { hasText: 'Societies & SIGs' });
  const box = await chip.boundingBox();
  await smoothMove(page, box.x + box.width / 2, box.y + box.height / 2, 30);
  await sleep(300);
  mark('click_soc');
  await chip.click();
  await sleep(3000);
  // hover a few nodes around the middle of the graph
  for (const [x, y] of [[760, 520], [840, 600], [700, 640]]) { await smoothMove(page, x, y, 30); await sleep(900); }
  const all = page.locator('.cg-chip', { hasText: 'All' }).first();
  const ab = await all.boundingBox();
  await smoothMove(page, ab.x + ab.width / 2, ab.y + ab.height / 2, 30);
  mark('click_all');
  await all.click();
  await sleep(2500);
  const today = page.locator('.cg-chip', { hasText: 'Happening today' });
  mark('click_today');
  await today.click();
  await sleep(3000);
  await all.click();
  await sleep(1500);
  mark('end');
});

await session('c_ask', DESK, async (page, mark) => {
  let ok = false;
  for (let i = 0; i < 3 && !ok; i++) {
    if (i > 0) { await page.reload({ waitUntil: 'networkidle' }); await sleep(3500); }
    ok = await ask(page, mark, "I'm a Year 1 student. I love photography and want to make friends. I'm free Friday evenings.", 'q1');
    console.log('gemini?', ok);
  }
  mark('q1_gemini_' + ok);
  await sleep(5000);
  mark('q1_hold_end');
  await sleep(800);
  ok = await ask(page, mark, 'How do I join the Photography Club?', 'q2');
  mark('q2_gemini_' + ok);
  await page.waitForSelector('.dc', { timeout: 15000 }).catch(() => {});
  mark('card_open');
  await sleep(2500);
  const sc = page.locator('.dc-scroll');
  const b = await sc.boundingBox();
  if (b) {
    await smoothMove(page, b.x + b.width / 2, b.y + b.height / 2, 20);
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 60); await sleep(120); }
    await sleep(2000);
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 60); await sleep(120); }
    await sleep(2000);
  }
  mark('card_scrolled');
  // hover the Go together / week buttons
  const go = page.locator('.dc-actions button').first();
  const gb = await go.boundingBox().catch(() => null);
  if (gb) { await smoothMove(page, gb.x + gb.width / 2, gb.y + gb.height / 2, 30); await sleep(600); mark('click_go'); await go.click(); await sleep(2000); }
  mark('end');
});

await session('e_today', DESK, async (page, mark) => {
  mark('start');
  const ev = page.locator('.chat-event').first();
  const b = await ev.boundingBox();
  await smoothMove(page, b.x + b.width / 2, b.y + b.height / 2, 40);
  await sleep(500);
  mark('click');
  await ev.click();
  await sleep(5000);
  mark('end');
});

await session('f_mobile', { width: 390, height: 844 }, async (page, mark) => {
  mark('start');
  await sleep(2500);
  const h = page.locator('.sheet-handle');
  mark('expand');
  await h.click();
  await sleep(3000);
  const ev = page.locator('.chat-event').first();
  if (await ev.count()) { mark('event'); await ev.click(); await sleep(4000); }
  mark('end');
});

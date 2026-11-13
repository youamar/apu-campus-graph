// Shared deterministic scene runtime. The recorder calls window.__seek(t) per frame.
(function () {
  const W = 1920, H = 1080;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const COLORS = { soc: '#2a83ff', spo: '#42ba96', intl: '#ff8b33' };
  const ease = (x) => (x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3));
  const easeIO = (x) => (x < 0 ? 0 : x > 1 ? 1 : x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  // background stars
  const bg = [];
  for (let i = 0; i < 260; i++) bg.push({ x: rnd() * W, y: rnd() * H, r: rnd() * 1.4 + 0.3, ph: rnd() * 6.28, sp: 0.5 + rnd() * 2 });

  // constellation: 137 nodes in 3 clusters (82 soc, 33 spo, 22 intl)
  const centers = { soc: [860, 500, 330], spo: [1330, 430, 210], intl: [1200, 770, 170] };
  const nodes = [];
  const add = (cat, n) => {
    const [cx, cy, R] = centers[cat];
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R;
      nodes.push({ cat, x: cx + Math.cos(a) * d * 1.15, y: cy + Math.sin(a) * d * 0.8,
        sx: rnd() * W * 1.4 - W * 0.2, sy: rnd() * H * 1.4 - H * 0.2,
        r: 3 + rnd() * 4, bright: rnd() < 0.14, live: rnd() < 0.04, ph: rnd() * 6.28, delay: rnd() * 0.5 });
    }
  };
  add('soc', 82); add('spo', 33); add('intl', 22);
  const links = [];
  nodes.forEach((a, i) => {
    const near = nodes.map((b, j) => [j, (a.x - b.x) ** 2 + (a.y - b.y) ** 2]).filter(([j]) => j !== i && nodes[j].cat === a.cat)
      .sort((p, q) => p[1] - q[1]).slice(0, 2);
    near.forEach(([j]) => { if (j > i) links.push([i, j, rnd()]); });
  });

  function drawStars(ctx, t, alpha = 1) {
    for (const s of bg) {
      const tw = 0.45 + 0.55 * Math.sin(t * s.sp + s.ph);
      ctx.globalAlpha = alpha * (0.25 + 0.6 * tw);
      ctx.fillStyle = '#cfe0ff';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // progress 0..1 forms the constellation; opts: {ox, oy, scale, alpha}
  function drawGraph(ctx, t, p, o = {}) {
    const ox = o.ox || 0, oy = o.oy || 0, sc = o.scale || 1, al = o.alpha == null ? 1 : o.alpha;
    const pos = nodes.map((n) => {
      const q = easeIO((p - n.delay * 0.4) / 0.6);
      const x = n.sx + (n.x - n.sx) * q, y = n.sy + (n.y - n.sy) * q;
      return [W / 2 + (x - W / 2) * sc + ox + Math.sin(t * 0.6 + n.ph) * 3, H / 2 + (y - H / 2) * sc + oy + Math.cos(t * 0.5 + n.ph) * 3, q];
    });
    ctx.lineWidth = 1.2;
    for (const [i, j, d] of links) {
      const lp = ease((p - 0.55 - d * 0.25) / 0.3);
      if (lp <= 0) continue;
      const [x1, y1] = pos[i], [x2, y2] = pos[j];
      ctx.strokeStyle = COLORS[nodes[i].cat];
      ctx.globalAlpha = al * 0.35 * lp;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + (x2 - x1) * lp, y1 + (y2 - y1) * lp); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    nodes.forEach((n, i) => {
      const [x, y, q] = pos[i];
      const c = COLORS[n.cat];
      const tw = 0.75 + 0.25 * Math.sin(t * 3 + n.ph);
      const r = n.r * sc * (n.bright ? 1.6 : 1);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * (n.bright ? 7 : 4));
      g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = al * (0.35 + 0.65 * q) * tw * (n.bright ? 0.9 : 0.55);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * (n.bright ? 7 : 4), 0, 6.283); ctx.fill();
      ctx.globalAlpha = al * (0.4 + 0.6 * q);
      ctx.fillStyle = n.bright ? '#fff' : c; ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, 6.283); ctx.fill();
      if (n.live && q > 0.9) {
        const k = (t * 0.8 + n.ph) % 1;
        ctx.globalAlpha = al * (1 - k) * 0.9; ctx.strokeStyle = '#e04a5a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + k * 34, 0, 6.283); ctx.stroke();
      }
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  window.SC = { W, H, ease, easeIO, drawStars, drawGraph, nodes, COLORS };

  // runtime: scene defines window.draw(t) (optional) and window.DURATION
  window.__seek = (t) => {
    document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t * 1000; });
    const cv = document.getElementById('cv');
    if (cv && window.draw) { const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, W, H); window.draw(ctx, t); }
  };
  window.addEventListener('load', () => {
    if (location.hash === '#render') return;
    const t0 = performance.now();
    const loop = () => { const t = ((performance.now() - t0) / 1000) % (window.DURATION || 5); window.__seek(t); requestAnimationFrame(loop); };
    loop();
  });
})();

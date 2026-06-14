/* AD·OS — shared behavior for the concept build */

/* ── dot grille: cursor-reactive only, idle = perfectly static ── */
document.querySelectorAll('canvas.grille').forEach(cv => {
  const ctx = cv.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W, H, pts = [], mx = -9999, my = -9999, raf = null;
  const GAP = 20, R = 82;

  function build(){
    const r = cv.getBoundingClientRect();
    W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pts = [];
    for (let y = GAP/2; y < H; y += GAP)
      for (let x = GAP/2; x < W; x += GAP) pts.push({x, y});
    render();
  }
  function render(){
    const deep = cv.closest('.device') && cv.closest('.device').classList.contains('deeptech');
    const base = deep ? 0.12 : 0.07;
    ctx.clearRect(0, 0, W, H);
    for (const p of pts){
      let lit = Math.max(0, 1 - Math.hypot(p.x - mx, p.y - my) / R); lit *= lit;
      if (lit > 0.04){
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.2 + lit*2.5, 0, 6.283);
        ctx.fillStyle = `rgba(255,45,45,${0.2 + lit*0.8})`; ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.2, 0, 6.283);
        ctx.fillStyle = `rgba(255,255,255,${base})`; ctx.fill();
      }
    }
  }
  function schedule(){ if (!raf) raf = requestAnimationFrame(() => { raf = null; render(); }); }
  cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; schedule(); });
  cv.addEventListener('mouseleave', () => { mx = my = -9999; schedule(); });
  cv.closest('.device')?.addEventListener('grille-redraw', render);
  window.addEventListener('resize', build);
  build();
});

/* ── mode switch: CONCEPT ⟷ DEEPTECH ── */
document.querySelectorAll('.modesw').forEach(sw => {
  sw.addEventListener('click', () => {
    const dev = sw.closest('.device');
    dev.classList.toggle('deeptech');
    dev.dispatchEvent(new Event('grille-redraw'));
  });
});

/* ── experience filters ── */
const FILTERS = ['product','project','growth','creative'];
let active = null;
function setFilter(key){
  active = (active === key) ? null : key;
  document.querySelectorAll('.fbtn').forEach(b => b.classList.toggle('on', b.dataset.f === active));
  document.body.classList.toggle('filtering', !!active);
  document.querySelectorAll('.job').forEach(job => {
    let hit = false;
    job.querySelectorAll('[data-tags]').forEach(li => {
      const m = active && li.dataset.tags.split(' ').includes(active);
      li.classList.toggle('match', !!m); if (m) hit = true;
    });
    job.classList.toggle('nomatch', !!active && !hit);
  });
}
window.setFilter = setFilter;
document.querySelectorAll('.fbtn').forEach(b => b.addEventListener('click', () => setFilter(b.dataset.f)));

/* ── show more on job cards ── */
window.toggleMore = function(btn){
  const j = btn.closest('.job'); j.classList.toggle('open');
  btn.textContent = j.classList.contains('open') ? '— less' : btn.dataset.label;
};

/* ── VU meters: live magnitude ── */
document.querySelectorAll('[data-vu]').forEach(vu => {
  const n = +vu.dataset.vu || 10;
  for (let i=0;i<n;i++) vu.appendChild(document.createElement('i'));
  const bars = [...vu.children];
  setInterval(() => {
    const lvl = 3 + Math.floor(Math.random()* (n-3));
    bars.forEach((b,i) => { b.style.height = (8 + Math.random()*34) + 'px'; b.classList.toggle('on', i < lvl); });
  }, 240);
});

/* ── segment cycle: rotate a few values ── */
document.querySelectorAll('[data-cycle]').forEach(el => {
  const vals = el.dataset.cycle.split('|'); let i = 0;
  setInterval(() => { i = (i+1) % vals.length; el.textContent = vals[i]; }, 1500);
});

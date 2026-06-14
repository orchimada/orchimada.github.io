/* AD·OS — shared behavior */

/* ── dot grille: cursor-reactive, idle = static. Works as device screen
   (dark ground) or full-section background (data-ground="light"). ── */
(function(){
  const canvases = document.querySelectorAll('canvas.grille');
  let MX = -9999, MY = -9999;
  const instances = [];

  canvases.forEach(cv => {
    const ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const inst = { cv, ctx, dpr, W:0, H:0, pts:[], raf:null,
      light: cv.dataset.ground === 'light' };

    inst.build = function(){
      const r = cv.getBoundingClientRect();
      inst.W = r.width; inst.H = r.height;
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      const GAP = 22; inst.pts = [];
      for (let y = GAP/2; y < inst.H; y += GAP)
        for (let x = GAP/2; x < inst.W; x += GAP) inst.pts.push({x,y});
      inst.render();
    };
    inst.render = function(){
      const rect = cv.getBoundingClientRect();
      const mx = MX - rect.left, my = MY - rect.top;
      const deep = cv.closest('.device') && cv.closest('.device').classList.contains('deeptech');
      const base = inst.light ? 0.11 : (deep ? 0.13 : 0.07);
      const R = 96;
      ctx.clearRect(0,0,inst.W,inst.H);
      for (const p of inst.pts){
        let lit = Math.max(0, 1 - Math.hypot(p.x-mx, p.y-my)/R); lit *= lit;
        if (lit > 0.04){
          ctx.beginPath(); ctx.arc(p.x,p.y,1.3+lit*2.6,0,6.283);
          ctx.fillStyle = `rgba(255,45,45,${0.22+lit*0.78})`; ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(p.x,p.y,1.3,0,6.283);
          ctx.fillStyle = inst.light ? `rgba(16,16,19,${base})` : `rgba(255,255,255,${base})`;
          ctx.fill();
        }
      }
    };
    inst.schedule = function(){ if(!inst.raf) inst.raf = requestAnimationFrame(()=>{ inst.raf=null; inst.render(); }); };
    inst.build();
    cv.closest('.device')?.addEventListener('grille-redraw', inst.render);
    instances.push(inst);
  });

  if (instances.length){
    window.addEventListener('mousemove', e => { MX = e.clientX; MY = e.clientY; instances.forEach(i=>i.schedule()); });
    document.addEventListener('mouseout', e => { if(!e.relatedTarget){ MX=MY=-9999; instances.forEach(i=>i.schedule()); } });
    window.addEventListener('resize', () => instances.forEach(i=>i.build()));
  }
})();

/* ── mode switch: CONCEPT ⟷ DEEPTECH ── */
document.querySelectorAll('.modesw').forEach(sw => {
  sw.addEventListener('click', () => {
    const dev = sw.closest('.device');
    dev.classList.toggle('deeptech');
    dev.dispatchEvent(new Event('grille-redraw'));
  });
});

/* ── experience filters ── */
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

/* ── VU meters ── */
document.querySelectorAll('[data-vu]').forEach(vu => {
  const n = +vu.dataset.vu || 10;
  for (let i=0;i<n;i++) vu.appendChild(document.createElement('i'));
  const bars = [...vu.children];
  setInterval(() => {
    const lvl = 3 + Math.floor(Math.random()*(n-3));
    bars.forEach((b,i) => { b.style.height = (8 + Math.random()*34)+'px'; b.classList.toggle('on', i<lvl); });
  }, 240);
});

/* ── segment cycle ── */
document.querySelectorAll('[data-cycle]').forEach(el => {
  const vals = el.dataset.cycle.split('|'); let i = 0;
  setInterval(() => { i=(i+1)%vals.length; el.textContent = vals[i]; }, 1500);
});

(() => {
  'use strict';

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = $('score');
  const bestEl = $('best');
  const bestStartEl = $('bestStart');
  const bestOverEl = $('bestOver');
  const finalScoreEl = $('finalScore');
  const diffEl = $('difficulty');
  const newBestEl = $('newBest');
  const startScreen = $('startScreen');
  const pauseScreen = $('pauseScreen');
  const overScreen = $('overScreen');
  const pauseBtn = $('pauseBtn');
  const muteBtn = $('muteBtn');

  // ---------- Config ----------
  const BEST_KEY = 'ugreen-zigzag-best';
  const MUTE_KEY = 'ugreen-zigzag-muted';
  const SQ = Math.SQRT1_2;            // paths run at 45 degrees
  const WANDER_LIMIT = 240;           // how far the path may drift sideways
  const RAMP_SCORE = 400;             // score at which difficulty maxes out
  const FALL_TIME = 0.75;             // seconds of falling animation
  const LEVELS = [
    { name: 'EASY', at: 0 },
    { name: 'MEDIUM', at: 60 },
    { name: 'HARD', at: 160 },
    { name: 'INSANE', at: 320 },
  ];

  // ---------- Storage helpers ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  let best = parseInt(store.get(BEST_KEY) || '0', 10) || 0;
  let muted = store.get(MUTE_KEY) === '1';

  // ---------- Sprite ----------
  const sprite = new Image();
  let spriteReady = false;
  sprite.onload = () => { spriteReady = true; };
  sprite.src = 'ugreen-robot-charger.png';

  // ---------- State ----------
  let W = 0, H = 0, S = 1, dpr = 1;
  let state = 'idle';                 // idle | playing | paused | falling | over
  let dir = 1;                        // +1 = right, -1 = left
  let px = 0, py = 0, camX = 0;
  let tilt = 0.16;
  let bonus = 0, score = 0;
  let speed = 2.6, hh = 62;           // hh = path half-width measured horizontally
  let pts = [], gems = [], parts = [];
  let genDir = 1, genX = 0, genY = 0;
  let fallT = 0, t = 0, lastTime = 0, overAt = 0;
  let levelIdx = 0;

  // ---------- Audio ----------
  let actx = null;
  function beep(freq, dur, type, vol, slide) {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const now = actx.currentTime;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, now);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + dur);
      g.gain.setValueAtTime(vol || 0.04, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g);
      g.connect(actx.destination);
      o.start(now);
      o.stop(now + dur);
    } catch (e) { /* audio is optional */ }
  }

  // ---------- Layout ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    S = Math.max(0.8, Math.min(W / 420, 1.5));
  }

  const sx = (wx) => W / 2 + (wx - camX) * S;
  const sy = (wy) => H * 0.74 - (wy - py) * S;

  // ---------- Path ----------
  function addSegment() {
    const len = 160 + Math.random() * 220;
    let d = Math.random() < 0.7 ? -genDir : genDir;
    if (genX + d * len > WANDER_LIMIT) d = -1;
    else if (genX + d * len < -WANDER_LIMIT) d = 1;
    const nx = genX + d * len;
    const ny = genY + len;

    if (Math.random() < 0.55) {
      const n = 3 + ((Math.random() * 3) | 0);
      for (let i = 1; i <= n; i++) {
        const k = i / (n + 1);
        gems.push({ x: genX + (nx - genX) * k, y: genY + (ny - genY) * k, got: false });
      }
    }
    pts.push({ x: nx, y: ny });
    genX = nx; genY = ny; genDir = d;
  }

  function ensurePath() {
    while (genY < py + H / S + 500) addSegment();
    while (pts.length > 3 && pts[1].y < py - (H * 0.26) / S - 150) pts.shift();
    if (gems.length > 60) gems = gems.filter((g) => !g.got && g.y > py - 250);
  }

  function centerAt(y) {
    for (let i = pts.length - 2; i >= 0; i--) {
      if (pts[i].y <= y) {
        const a = pts[i], b = pts[i + 1];
        return a.x + (b.x - a.x) * ((y - a.y) / (b.y - a.y));
      }
    }
    return pts[0].x;
  }

  // ---------- Game flow ----------
  const pad = (n) => String(Math.max(0, n)).padStart(4, '0');

  function setScore(v) {
    if (v === score && scoreEl.textContent === pad(v)) return;
    score = v;
    scoreEl.textContent = pad(v);
  }

  function updateDifficulty(initial) {
    let idx = 0;
    for (let i = 0; i < LEVELS.length; i++) if (score >= LEVELS[i].at) idx = i;
    if (idx !== levelIdx || initial) {
      const grew = idx > levelIdx;
      levelIdx = idx;
      diffEl.textContent = LEVELS[idx].name;
      if (grew) {
        diffEl.classList.remove('flash');
        void diffEl.offsetWidth;
        diffEl.classList.add('flash');
        beep(660, 0.18, 'triangle', 0.05, 440);
      }
    }
  }

  function showBest() {
    const b = pad(best);
    bestEl.textContent = b;
    bestStartEl.textContent = b;
    bestOverEl.textContent = b;
  }

  const show = (el) => el.classList.remove('hidden');
  const hide = (el) => el.classList.add('hidden');

  function reset() {
    pts = [{ x: -300, y: -300 }, { x: 0, y: 0 }, { x: 140, y: 140 }];
    genDir = 1; genX = 140; genY = 140;
    gems = []; parts = [];
    px = 0; py = 0; camX = 0;
    dir = 1; tilt = 0.16;
    bonus = 0; fallT = 0;
    score = -1; setScore(0);
    levelIdx = 0; updateDifficulty(true);
    speed = 2.6; hh = 62;
    ensurePath();
  }

  function startGame() {
    reset();
    state = 'playing';
    hide(startScreen); hide(pauseScreen); hide(overScreen);
    beep(520, 0.12, 'square', 0.04, 300);
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      show(pauseScreen);
    } else if (state === 'paused') {
      state = 'playing';
      hide(pauseScreen);
      lastTime = performance.now();
    }
  }

  function startFall() {
    state = 'falling';
    fallT = 0;
    beep(300, 0.5, 'sawtooth', 0.05, -220);
    if (navigator.vibrate) { try { navigator.vibrate(60); } catch (e) { /* ignore */ } }
  }

  function gameOver() {
    state = 'over';
    overAt = performance.now();
    const isNew = score > best;
    if (isNew) { best = score; store.set(BEST_KEY, String(best)); }
    finalScoreEl.textContent = pad(score);
    newBestEl.classList.toggle('hidden', !isNew);
    showBest();
    show(overScreen);
  }

  function turn() {
    if (state !== 'playing') return;
    dir = -dir;
    beep(dir > 0 ? 440 : 392, 0.05, 'square', 0.025);
  }

  // ---------- Particles ----------
  function spark(x, y, color, n, power) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.5 + Math.random()) * power;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.3, max: 0.8, color });
    }
  }

  // ---------- Update ----------
  function update(dt) {
    const s = dt * 60;
    t += dt;

    const ramp = Math.min(score, RAMP_SCORE) / RAMP_SCORE;
    speed = 2.6 + ramp * 2.0;
    hh = 62 - ramp * 22;

    if (state === 'playing') {
      px += dir * speed * s;
      py += speed * s;
      setScore(Math.floor(py / 14) + bonus);
      updateDifficulty(false);
      ensurePath();

      if (Math.abs(px - centerAt(py)) > hh) startFall();

      for (const g of gems) {
        if (!g.got && Math.abs(g.x - px) < 28 && Math.abs(g.y - py) < 28) {
          g.got = true;
          bonus += 5;
          spark(g.x, g.y, '#2bd96b', 10, 2.2);
          beep(880, 0.09, 'triangle', 0.05, 520);
        }
      }

      if (Math.random() < 0.6) {
        parts.push({ x: px - dir * 4, y: py - 6, vx: -dir * 0.3 + (Math.random() - 0.5) * 0.6, vy: -0.6, life: 0.35, max: 0.35, color: '#2bd96b' });
      }
    } else if (state === 'falling') {
      fallT += dt;
      px += dir * speed * 0.5 * s;
      py += speed * 0.4 * s;
      if (fallT >= FALL_TIME) gameOver();
    }

    for (const p of parts) {
      p.x += p.vx * s; p.y += p.vy * s; p.life -= dt;
    }
    parts = parts.filter((p) => p.life > 0);

    camX += (px - camX) * Math.min(1, 0.1 * s);
    tilt += (dir * 0.16 - tilt) * Math.min(1, 0.2 * s);
  }

  // ---------- Draw ----------
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d1512');
    g.addColorStop(1, '#060807');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const gs = 90;
    ctx.strokeStyle = 'rgba(43, 217, 107, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const y0 = Math.floor((py - (H * 0.3) / S) / gs) * gs;
    for (let y = y0; y < py + (H * 0.8) / S; y += gs) {
      const yy = Math.round(sy(y)) + 0.5;
      ctx.moveTo(0, yy); ctx.lineTo(W, yy);
    }
    const x0 = Math.floor((camX - W / 2 / S) / gs) * gs;
    for (let x = x0; x < camX + W / 2 / S + gs; x += gs) {
      const xx = Math.round(sx(x)) + 0.5;
      ctx.moveTo(xx, 0); ctx.lineTo(xx, H);
    }
    ctx.stroke();
  }

  function drawPath() {
    const perp = 2 * hh * SQ * S;
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = sx(pts[i].x), y = sy(pts[i].y);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 4;
    ctx.lineCap = 'butt';

    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(43, 217, 107, 0.18)';
    ctx.lineWidth = perp + 22 * S;
    ctx.stroke();

    ctx.strokeStyle = '#2bd96b';
    ctx.lineWidth = perp + 4;
    ctx.stroke();

    ctx.strokeStyle = '#22322c';
    ctx.lineWidth = perp;
    ctx.stroke();

    ctx.setLineDash([14 * S, 16 * S]);
    ctx.lineDashOffset = -(py * S);
    ctx.strokeStyle = 'rgba(43, 217, 107, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawGems() {
    for (const g of gems) {
      if (g.got) continue;
      const x = sx(g.x);
      const y = sy(g.y) + Math.sin(t * 4 + g.y * 0.05) * 3 * S;
      if (y < -20 || y > H + 20) continue;
      const r = 11 * S;
      ctx.fillStyle = 'rgba(43, 217, 107, 0.22)';
      ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2bd96b';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      // lightning bolt
      ctx.fillStyle = '#04130a';
      ctx.beginPath();
      ctx.moveTo(x + 2 * S, y - 7 * S);
      ctx.lineTo(x - 4 * S, y + 1 * S);
      ctx.lineTo(x, y + 1 * S);
      ctx.lineTo(x - 2 * S, y + 7 * S);
      ctx.lineTo(x + 4 * S, y - 1 * S);
      ctx.lineTo(x, y - 1 * S);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(sx(p.x), sy(p.y), 2.5 * S, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    if (state === 'over') return;
    const x = sx(px);
    let y = sy(py);
    let scale = 1, rot = tilt, alpha = 1;

    if (state === 'falling') {
      const k = Math.min(1, fallT / FALL_TIME);
      scale = 1 - 0.7 * k;
      rot += dir * k * 5;
      alpha = 1 - k;
      y += k * 40 * S;
    }

    const bob = state === 'playing' || state === 'idle' ? Math.sin(t * 14) * 1.5 * S : 0;
    const h = 78 * S;
    const w = h * (spriteReady && sprite.height ? sprite.width / sprite.height : 0.62);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y - bob);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    if (spriteReady) {
      ctx.shadowColor = 'rgba(43, 217, 107, 0.55)';
      ctx.shadowBlur = 16 * S;
      ctx.drawImage(sprite, -w / 2, -h + 4 * S, w, h);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#f2f5f3';
      ctx.fillRect(-w / 2, -h, w, h);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function draw() {
    drawBackground();
    drawPath();
    drawGems();
    drawParticles();
    drawPlayer();
  }

  // ---------- Loop ----------
  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;
    if (state === 'playing' || state === 'falling') update(dt);
    else if (state === 'idle' || state === 'over') t += dt;
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- Input ----------
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); turn(); });

  startScreen.addEventListener('pointerdown', (e) => { e.preventDefault(); startGame(); });
  pauseBtn.addEventListener('click', togglePause);
  $('resumeBtn').addEventListener('click', togglePause);
  $('restartBtn').addEventListener('click', startGame);
  $('againBtn').addEventListener('click', () => {
    if (performance.now() - overAt > 350) startGame();
  });

  function paintMute() { muteBtn.textContent = muted ? '🔇' : '🔊'; }
  muteBtn.addEventListener('click', () => {
    muted = !muted;
    store.set(MUTE_KEY, muted ? '1' : '0');
    paintMute();
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
      e.preventDefault();
      if (state === 'idle') startGame();
      else if (state === 'playing') turn();
      else if (state === 'over' && performance.now() - overAt > 350) startGame();
      else if (state === 'paused') togglePause();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      togglePause();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'playing') togglePause();
  });
  window.addEventListener('resize', resize);
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------- Boot ----------
  resize();
  showBest();
  paintMute();
  reset();
  requestAnimationFrame((now) => { lastTime = now; requestAnimationFrame(frame); });
})();

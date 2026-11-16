/* ゲームエンジン：Canvas管理・ゲームループ・競技場の描画・演出エフェクト */
(function () {
  'use strict';
  const PPO = (window.PPO = window.PPO || {});
  const U = PPO.U;

  const THEMES = {
    day: { sky: ['#4fb8ff', '#c4ecff'], stand: '#2f5fa8', wall: '#1d4a8c', grass: '#4cb84f', grass2: '#43a847', track: '#d65a3c', track2: '#c94f33', night: false, sun: true },
    afternoon: { sky: ['#ffae4f', '#ffe7b0'], stand: '#7a3f9e', wall: '#5a2a7a', grass: '#56b648', grass2: '#4aa53e', track: '#d65a3c', track2: '#c94f33', night: false, sun: true },
    field: { sky: ['#62c4ff', '#e2f6ff'], stand: '#1e8a6a', wall: '#156850', grass: '#5cc456', grass2: '#4fb04a', track: '#d06a3c', track2: '#c35f33', night: false, sun: true },
    evening: { sky: ['#ff6f61', '#ffc98b'], stand: '#5a3a8a', wall: '#3f2768', grass: '#4aa04a', grass2: '#3f9040', track: '#c9553a', track2: '#b84a31', night: false, sun: false, dusk: true },
    night: { sky: ['#071530', '#21407c'], stand: '#1a2850', wall: '#121d3c', grass: '#2f8a3f', grass2: '#2a7c38', track: '#b84a35', track2: '#a6402e', night: true },
    sunset: { sky: ['#fd6585', '#ffd38a'], stand: '#c0392b', wall: '#8e2a20', grass: '#4fa84a', grass2: '#45983f', track: '#d2583b', track2: '#c04d33', night: false, dusk: true },
    relay: { sky: ['#0d1f4a', '#3a2a7a'], stand: '#2a1f5a', wall: '#1d163f', grass: '#2f8a3f', grass2: '#2a7c38', track: '#2f6fd0', track2: '#2a63bb', night: true },
  };

  const SHIRTS = ['#ec4646', '#1d6fd8', '#ffc21a', '#22b35e', '#a050e0', '#ff7aa8', '#ffffff', '#ff8a3c'];

  // 観客席タイル（事前描画して軽量化）
  function makeStandsTile(theme, h, frame) {
    const w = 640;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = Math.max(40, Math.round(h));
    const c = cv.getContext('2d');
    c.fillStyle = theme.stand;
    c.fillRect(0, 0, w, cv.height);
    const rows = Math.max(2, Math.floor(cv.height / 26));
    const r = Math.min(12, cv.height / rows * 0.42);
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let row = 0; row < rows; row++) {
      const y = (row + 0.6) * (cv.height / rows);
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.fillRect(0, y + r * 0.9, w, 3);
      for (let x = r + (row % 2) * r * 1.2; x < w; x += r * 2.5) {
        const v = rnd();
        if (v < 0.08) continue;
        const bob = frame && rnd() < 0.6 ? -r * 0.35 : 0;
        if (frame === 0) rnd();
        PPO.drawCrowdDog(c, x, y + bob, r, Math.floor(rnd() * 8), frame === 1 && v > 0.4, SHIRTS[Math.floor(rnd() * SHIRTS.length)]);
      }
    }
    return cv;
  }

  class Stage {
    constructor(themeName) {
      this.theme = THEMES[themeName] || THEMES.day;
      this.themeName = themeName;
      this.tiles = null;
      this.tileH = 0;
      this.excite = 0.2;
      this.t = 0;
      this.ads = ['PUG PUG OLYMPIC', 'わんわん牛乳', 'ほねっこ食堂', 'BOW-WOW SPORTS', 'ぷにぷに肉球', 'パグ新聞'];
    }
    ensureTiles(h) {
      const hh = Math.round(h);
      if (this.tiles && Math.abs(this.tileH - hh) < 2) return;
      this.tileH = hh;
      this.tiles = [makeStandsTile(this.theme, hh, 0), makeStandsTile(this.theme, hh, 1)];
    }
    update(dt) { this.t += dt; }

    /* 背景：空・観客席・広告フェンス・芝生
       L: {W, H, standsTop, standsBottom, trackTop, camX, ppm} */
    drawBack(ctx, L) {
      const th = this.theme;
      const g = ctx.createLinearGradient(0, 0, 0, L.standsBottom);
      g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, L.W, L.standsBottom + 2);
      if (th.night) {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (let i = 0; i < 40; i++) {
          const sx = ((i * 137.5) % L.W), sy = ((i * 71.3) % Math.max(10, L.standsTop * 0.9));
          ctx.fillRect(sx, sy, 2, 2);
        }
        // 照明塔
        [0.18, 0.82].forEach((p) => {
          const x = L.W * p, y = Math.max(20, L.standsTop - 40);
          ctx.fillStyle = '#556';
          ctx.fillRect(x - 3, y, 6, L.standsTop - y + 10);
          ctx.fillStyle = '#fffbe0';
          ctx.fillRect(x - 26, y - 14, 52, 16);
          const lg = ctx.createRadialGradient(x, y, 4, x, y, 160);
          lg.addColorStop(0, 'rgba(255,250,210,0.55)'); lg.addColorStop(1, 'rgba(255,250,210,0)');
          ctx.fillStyle = lg;
          ctx.fillRect(x - 160, y - 160, 320, 320);
        });
      } else if (th.sun) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        const cx = ((-L.camX * L.ppm * 0.05) % (L.W + 300) + L.W + 300) % (L.W + 300) - 150;
        [[cx, L.standsTop * 0.35, 1], [cx + L.W * 0.55, L.standsTop * 0.55, 0.7]].forEach(([x, y, s]) => {
          ctx.beginPath();
          ctx.arc(x, y, 22 * s, 0, 7); ctx.arc(x + 24 * s, y - 10 * s, 26 * s, 0, 7); ctx.arc(x + 50 * s, y, 20 * s, 0, 7);
          ctx.fill();
        });
      } else if (th.dusk) {
        ctx.fillStyle = 'rgba(255,240,180,0.9)';
        ctx.beginPath(); ctx.arc(L.W * 0.8, L.standsTop * 0.7, Math.min(46, L.standsTop * 0.4), 0, 7); ctx.fill();
      }
      // 観客席
      const sh = L.standsBottom - L.standsTop;
      if (sh > 20) {
        this.ensureTiles(sh);
        const fr = (Math.floor(this.t * (2 + this.excite * 8)) % 2 === 0 || this.excite < 0.15) ? 0 : 1;
        const tile = this.tiles[fr];
        const off = ((L.camX * L.ppm * 0.35) % tile.width + tile.width) % tile.width;
        for (let x = -off; x < L.W; x += tile.width) ctx.drawImage(tile, x, L.standsTop);
        // 屋根
        ctx.fillStyle = th.wall;
        ctx.fillRect(0, L.standsTop - 10, L.W, 12);
      }
      // 広告フェンス
      const fh = Math.max(16, Math.min(30, (L.trackTop - L.standsBottom) || 22));
      const fy = L.standsBottom;
      ctx.fillStyle = th.wall;
      ctx.fillRect(0, fy, L.W, fh);
      const adW = 230;
      const aoff = ((L.camX * L.ppm * 0.8) % (adW * this.ads.length) + adW * this.ads.length) % (adW * this.ads.length);
      ctx.font = `900 ${Math.round(fh * 0.55)}px sans-serif`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      for (let i = -1; i < L.W / adW + 2; i++) {
        const idx = ((Math.floor((aoff) / adW) + i) % this.ads.length + this.ads.length) % this.ads.length;
        const x = i * adW - (aoff % adW);
        ctx.fillStyle = ['#ffc21a', '#ffffff', '#7fe0ff', '#ff9bb8'][idx % 4];
        ctx.fillText(this.ads[idx], x + adW / 2, fy + fh / 2 + 1);
      }
      // 芝生（トラック奥）
      ctx.fillStyle = th.grass;
      ctx.fillRect(0, fy + fh, L.W, Math.max(0, L.trackTop - fy - fh));
    }

    /* トラック（レーンつき） */
    drawTrack(ctx, L, lanes, laneGap) {
      const th = this.theme;
      const top = L.trackTop, bottom = L.groundY + laneGap * 0.7;
      ctx.fillStyle = th.track;
      ctx.fillRect(0, top, L.W, bottom - top);
      // 細かいテクスチャ
      ctx.fillStyle = th.track2;
      const stripeW = L.ppm * 2;
      const off = ((L.camX * L.ppm) % (stripeW * 2) + stripeW * 2) % (stripeW * 2);
      for (let x = -off; x < L.W; x += stripeW * 2) ctx.fillRect(x, top, stripeW, bottom - top);
      // レーンライン
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let k = 0; k <= lanes; k++) {
        const y = L.groundY + laneGap * 0.5 - k * laneGap;
        if (y < top - 1) continue;
        ctx.fillRect(0, y, L.W, Math.max(2, laneGap * 0.07));
      }
      // 手前の芝
      ctx.fillStyle = th.grass2;
      ctx.fillRect(0, bottom, L.W, L.H - bottom);
      ctx.fillStyle = th.grass;
      const gs = 40;
      const goff = ((L.camX * L.ppm * 1.15) % (gs * 2) + gs * 2) % (gs * 2);
      for (let x = -goff; x < L.W; x += gs * 2) ctx.fillRect(x, bottom, gs, L.H - bottom);
    }
  }

  /* 演出エフェクト */
  class FX {
    constructor() { this.list = []; this.texts = []; this.confetti = []; this.fireworks = []; this.shake = 0; this.flash = 0; this.banners = []; }
    clear() { this.list.length = 0; this.texts.length = 0; this.confetti.length = 0; this.fireworks.length = 0; this.banners.length = 0; this.shake = 0; this.flash = 0; }
    // ワールド座標の粒子（x:メートル, y:画面px）
    dust(wx, sy, n, col, spread) {
      for (let i = 0; i < n; i++) {
        this.list.push({ wx, sy, vx: U.rand(-1, 1) * (spread || 1.5), vy: -U.rand(20, 140), life: U.rand(0.35, 0.8), max: 0.8, r: U.rand(2, 6), col: col || 'rgba(230,200,160,0.9)' });
      }
    }
    text(x, y, str, col, size, dur) { this.texts.push({ x, y, str, col: col || '#fff', size: size || 30, life: dur || 1.1, max: dur || 1.1 }); }
    banner(str, col, dur, size) { this.banners.push({ str, col: col || '#ffc21a', life: dur || 1.4, max: dur || 1.4, size: size || 1 }); }
    burstConfetti(W, n) {
      for (let i = 0; i < (n || 120); i++) {
        this.confetti.push({ x: U.rand(0, W), y: U.rand(-200, -10), vx: U.rand(-40, 40), vy: U.rand(60, 180), rot: U.rand(0, 6), vr: U.rand(-8, 8), w: U.rand(6, 11), h: U.rand(9, 16), col: SHIRTS[U.randi(0, SHIRTS.length - 1)], life: U.rand(3, 5) });
      }
    }
    firework(x, y) {
      const col = SHIRTS[U.randi(0, 5)];
      const parts = [];
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2, s = U.rand(120, 220);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s });
      }
      this.fireworks.push({ parts, life: 1.4, max: 1.4, col });
      if (PPO.Sound) PPO.Sound.play('firework');
    }
    update(dt) {
      this.list = this.list.filter((p) => { p.life -= dt; p.wx += p.vx * dt; p.sy += p.vy * dt; p.vy += 400 * dt; return p.life > 0; });
      this.texts = this.texts.filter((p) => { p.life -= dt; p.y -= 40 * dt; return p.life > 0; });
      this.banners = this.banners.filter((b) => { b.life -= dt; return b.life > 0; });
      this.confetti = this.confetti.filter((c) => { c.life -= dt; c.x += c.vx * dt + Math.sin(c.life * 4) * 0.6; c.y += c.vy * dt; c.rot += c.vr * dt; return c.life > 0; });
      this.fireworks = this.fireworks.filter((f) => { f.life -= dt; f.parts.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy = p.vy * 0.97 + 60 * dt; }); return f.life > 0; });
      this.shake = Math.max(0, this.shake - dt * 30);
      this.flash = Math.max(0, this.flash - dt * 3);
    }
    drawWorld(ctx, camX, ppm) {
      this.list.forEach((p) => {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc((p.wx - camX) * ppm, p.sy, p.r, 0, 7); ctx.fill();
      });
      ctx.globalAlpha = 1;
    }
    drawScreen(ctx, W, H) {
      this.fireworks.forEach((f) => {
        ctx.globalAlpha = Math.max(0, f.life / f.max);
        ctx.fillStyle = f.col;
        f.parts.forEach((p) => { ctx.fillRect(p.x - 2, p.y - 2, 4, 4); });
      });
      ctx.globalAlpha = 1;
      this.confetti.forEach((c) => {
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
        ctx.fillStyle = c.col; ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h * Math.abs(Math.cos(c.rot * 2)));
        ctx.restore();
      });
      this.texts.forEach((p) => {
        const k = p.life / p.max;
        ctx.globalAlpha = Math.min(1, k * 3);
        Draw.text(ctx, p.str, p.x, p.y, p.size * (1 + (1 - k) * 0.1), p.col, 'center');
      });
      ctx.globalAlpha = 1;
      this.banners.forEach((b, i) => {
        const k = 1 - b.life / b.max;
        const sc = k < 0.15 ? U.easeOutBack(k / 0.15) : 1;
        const a = b.life < 0.25 ? b.life / 0.25 : 1;
        ctx.globalAlpha = a;
        const size = Math.min(W * 0.13, 72) * b.size * sc;
        Draw.text(ctx, b.str, W / 2, H * 0.36 + i * size * 1.1, size, b.col, 'center', 7);
      });
      ctx.globalAlpha = 1;
      if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.6})`; ctx.fillRect(0, 0, W, H); }
    }
  }

  /* 描画ヘルパー */
  const Draw = {
    text(ctx, str, x, y, size, col, align, stroke) {
      ctx.font = `900 ${Math.round(size)}px "Hiragino Maru Gothic ProN","Hiragino Sans","Noto Sans JP",sans-serif`;
      ctx.textAlign = align || 'left';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = stroke != null ? stroke : Math.max(3, size * 0.16);
      ctx.strokeStyle = 'rgba(20,12,40,0.92)';
      ctx.strokeText(str, x, y);
      ctx.fillStyle = col || '#fff';
      ctx.fillText(str, x, y);
    },
    panel(ctx, x, y, w, h, col, r) {
      PPO.roundRect(ctx, x, y, w, h, r != null ? r : 14);
      ctx.fillStyle = col || 'rgba(10,20,50,0.6)';
      ctx.fill();
    },
    // 横ゲージ
    gauge(ctx, x, y, w, h, ratio, col, label, zones) {
      Draw.panel(ctx, x - 3, y - 3, w + 6, h + 6, 'rgba(10,15,40,0.75)', h / 2 + 3);
      if (zones) zones.forEach((z) => {
        ctx.fillStyle = z.col;
        ctx.fillRect(x + w * z.from, y, w * (z.to - z.from), h);
      });
      PPO.roundRect(ctx, x, y, Math.max(h, w * U.clamp(ratio, 0, 1)), h, h / 2);
      ctx.fillStyle = col; ctx.fill();
      if (label) Draw.text(ctx, label, x + 8, y + h / 2 + 1, h * 0.8, '#fff', 'left', 3);
    },
  };

  /* ===== エンジン本体 ===== */
  const Engine = {
    canvas: null, ctx: null, dpr: 1, W: 0, H: 0,
    scene: null, paused: false, last: 0, acc: 0, step: 1 / 120,
    fx: new FX(), time: 0, running: false, controlsEl: null,

    init(canvas, controlsEl) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.controlsEl = controlsEl;
      const rs = () => this.resize();
      window.addEventListener('resize', rs);
      window.addEventListener('orientationchange', () => setTimeout(rs, 200));
      if (window.visualViewport) window.visualViewport.addEventListener('resize', rs);
      this.resize();
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    },

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const W = Math.max(200, r.width || window.innerWidth), H = Math.max(200, r.height || window.innerHeight);
      // 高解像度端末でも60FPSを保てるよう DPR は2まで
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.W = W; this.H = H;
      this.canvas.width = Math.round(W * this.dpr);
      this.canvas.height = Math.round(H * this.dpr);
      if (this.scene && this.scene.onResize) this.scene.onResize();
    },

    // 画面レイアウト（縦持ち／横持ちで自動調整）
    view() {
      const W = this.W, H = this.H;
      const portrait = H > W * 1.05;
      let ch = 0;
      if (this.controlsEl && !this.controlsEl.classList.contains('empty') && document.body.classList.contains('playing')) {
        ch = this.controlsEl.getBoundingClientRect().height || 0;
      }
      const playH = portrait ? H - ch : H - ch * 0.55;
      const pugSize = Math.max(56, Math.min(W * 0.3, playH * (portrait ? 0.24 : 0.36), 190));
      return { W, H, portrait, controlsH: ch, playH, pugSize };
    },

    setScene(scene) {
      if (this.scene && this.scene.destroy) this.scene.destroy();
      this.scene = scene;
      this.paused = false;
      this.fx.clear();
      this.acc = 0;
      if (scene && scene.start) scene.start();
    },

    frame(now) {
      if (!this.running) return;
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > 0.1) dt = 0.1; // タブ復帰などの大きな飛びを抑える
      if (!this.paused && this.scene) {
        this.acc += dt;
        let n = 0;
        while (this.acc >= this.step && n < 16) {
          this.time += this.step;
          try { this.scene.update(this.step); } catch (e) { console.error(e); }
          this.fx.update(this.step);
          this.acc -= this.step;
          n++;
        }
        if (n >= 16) this.acc = 0;
      }
      this.draw();
      requestAnimationFrame((t) => this.frame(t));
    },

    draw() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (!this.scene) { ctx.fillStyle = '#0d2a57'; ctx.fillRect(0, 0, this.W, this.H); return; }
      ctx.save();
      if (this.fx.shake > 0) ctx.translate(U.rand(-1, 1) * this.fx.shake, U.rand(-1, 1) * this.fx.shake);
      try { this.scene.draw(ctx, this.W, this.H); } catch (e) { console.error(e); }
      ctx.restore();
      this.fx.drawScreen(ctx, this.W, this.H);
    },

    vibrate(ms) {
      if (PPO.Save.data.settings.vibration && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* noop */ } }
    },
  };

  /* メニュー背景：パグたちが走り回るスタジアム */
  class MenuScene {
    constructor() {
      this.stage = new Stage('day');
      this.t = 0;
      this.runners = Object.keys(PPO.PUGS).map((id, i) => ({ id, x: -3 - i * 2.7, v: 5 + i * 0.6, ph: i }));
      this.stage.excite = 0.5;
    }
    update(dt) {
      this.t += dt;
      this.stage.update(dt);
      this.runners.forEach((r) => {
        r.x += r.v * dt;
        r.ph += r.v * dt * 3;
        if (r.x > 22) { r.x = -4 - Math.random() * 6; r.v = 4.5 + Math.random() * 3; }
      });
    }
    draw(ctx, W, H) {
      const v = Engine.view();
      const ppm = W / 14;
      const groundY = H * 0.86;
      const laneGap = Math.min(v.pugSize * 0.35, H * 0.05);
      const trackTop = groundY - laneGap * 5.4;
      const L = { W, H, camX: this.t * 1.5, ppm, standsTop: H * 0.28, standsBottom: trackTop - 26, trackTop, groundY };
      this.stage.drawBack(ctx, L);
      this.stage.drawTrack(ctx, L, 5, laneGap);
      const size = Math.min(v.pugSize * 0.8, 120);
      this.runners.slice().reverse().forEach((r, ri) => {
        const i = this.runners.length - 1 - ri;
        const lane = i;
        const sc = 1 - lane * 0.06;
        PPO.drawPug(ctx, r.x * ppm, groundY - lane * laneGap, size * sc, { pug: r.id, pose: 'run', phase: r.ph, speed: 0.7, t: this.t, number: i + 1 });
      });
      ctx.fillStyle = 'rgba(10,30,80,0.18)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  PPO.Engine = Engine;
  PPO.Stage = Stage;
  PPO.FX = FX;
  PPO.Draw = Draw;
  PPO.MenuScene = MenuScene;
  PPO.THEMES = THEMES;
})();

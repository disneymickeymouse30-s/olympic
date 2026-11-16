/* 表彰式シーン・結果画面の背景シーン */
(function () {
  'use strict';
  const PPO = window.PPO;
  const U = PPO.U, Draw = PPO.Draw, Sound = PPO.Sound, Engine = PPO.Engine;

  const MEDAL_COL = ['#ffd84f', '#d9dee4', '#e09a5c'];

  function drawMedal(ctx, x, y, r, rank) {
    ctx.strokeStyle = ['#ec4646', '#1d6fd8', '#22b35e'][rank - 1];
    ctx.lineWidth = r * 0.45;
    ctx.beginPath(); ctx.moveTo(x - r * 1.1, y - r * 2.2); ctx.lineTo(x, y - r * 0.6); ctx.lineTo(x + r * 1.1, y - r * 2.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
    ctx.fillStyle = MEDAL_COL[rank - 1]; ctx.fill();
    ctx.lineWidth = r * 0.15; ctx.strokeStyle = 'rgba(80,50,0,0.6)'; ctx.stroke();
    ctx.fillStyle = 'rgba(80,50,0,0.7)';
    ctx.font = `900 ${Math.round(r)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(rank), x, y + 1);
  }

  /* 表彰台：top3 = [{pug, name, isPlayer}]（1位,2位,3位の順） */
  class CeremonyScene {
    constructor(top3, opts) {
      this.top3 = top3;
      this.opts = opts || {};
      this.stage = new PPO.Stage('night');
      this.stage.excite = 1;
      this.t = 0;
      this.nextFw = 1.5;
      this.playerGold = top3[0] && top3[0].isPlayer;
    }
    controls() { return [{ id: 'act', label: 'つぎへ', sub: '総合結果を見る', cls: 'act', wide: true }]; }
    start() {
      Sound.stopBGM();
      Sound.play('fanfare');
      setTimeout(() => { if (Engine.scene === this) Sound.playBGM('ceremony'); }, 1800);
      PPO.Input.setDim('act', true);
    }
    onInput(id, phase) {
      if (phase === 'down' && id === 'act' && this.t > 3.2 && this.opts.onDone) {
        Sound.play('select');
        const f = this.opts.onDone; this.opts.onDone = null; f();
      }
    }
    update(dt) {
      this.t += dt;
      this.stage.update(dt);
      if (this.t > 3.2) PPO.Input.setDim('act', false);
      if (this.playerGold || this.opts.celebrate) {
        this.nextFw -= dt;
        if (this.nextFw <= 0) {
          this.nextFw = U.rand(0.5, 1.1);
          Engine.fx.firework(U.rand(Engine.W * 0.15, Engine.W * 0.85), U.rand(Engine.H * 0.08, Engine.H * 0.3));
        }
        if (Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2) && this.t > 2.6 && this.t < 9) Engine.fx.burstConfetti(Engine.W, 30);
      }
    }
    draw(ctx, W, H) {
      const v = Engine.view();
      const groundY = v.playH * 0.86;
      const L = { W, H, camX: this.t * 0.3, ppm: 40, standsTop: v.playH * 0.12, standsBottom: v.playH * 0.42, trackTop: v.playH * 0.47, groundY };
      this.stage.drawBack(ctx, L);
      ctx.fillStyle = '#2f8a3f'; ctx.fillRect(0, L.trackTop, W, H - L.trackTop);
      // スポットライト
      const g = ctx.createRadialGradient(W / 2, groundY - 60, 10, W / 2, groundY - 60, Math.max(W, H) * 0.5);
      g.addColorStop(0, 'rgba(255,250,210,0.35)'); g.addColorStop(1, 'rgba(255,250,210,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      Draw.text(ctx, '表彰式', W / 2, Math.max(54, v.playH * 0.08), Math.min(48, W * 0.11), '#ffd84f', 'center', 6);

      const bw = Math.min(W * 0.28, 170);
      const hs = [bw * 0.95, bw * 0.7, bw * 0.5];
      const xs = [W / 2, W / 2 - bw * 1.02, W / 2 + bw * 1.02];
      const size = Math.min(bw * 0.95, v.playH * 0.22);
      // 3位→2位→1位の順に登場
      const appear = [2.0, 1.2, 0.4];
      [1, 2, 0].forEach((i) => {
        const x = xs[i], h = hs[i];
        const top = groundY - h;
        ctx.fillStyle = ['#ffd84f', '#d9dee4', '#e09a5c'][i];
        PPO.roundRect(ctx, x - bw / 2, top, bw, h + 6, 8); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x - bw / 2, top + h * 0.75, bw, h * 0.25 + 6);
        Draw.text(ctx, String(i + 1), x, top + h * 0.42, h * 0.45, '#fff', 'center', 5);
        const p = this.top3[i];
        if (!p) return;
        const k = U.clamp((this.t - appear[i]) / 0.5, 0, 1);
        if (k <= 0) return;
        const drop = (1 - U.easeOutBack(k)) * -H * 0.5;
        PPO.drawPug(ctx, x, top + drop, size, { pug: p.pug, pose: this.t - appear[i] > 0.6 ? 'podium' : 'air', t: this.t + i, bib: true, number: p.number || i + 1 });
        if (k >= 1) drawMedal(ctx, x + size * 0.02, top - size * 0.3, size * 0.09, i + 1);
        Draw.text(ctx, p.isPlayer ? 'あなた' : p.name, x, top + h + 22, Math.min(20, bw * 0.15), p.isPlayer ? '#ffd84f' : '#fff', 'center', 4);
        if (p.isPlayer && k >= 1) Draw.text(ctx, '★', x, top - size * 1.25, 30, '#ffd84f', 'center', 4);
      });
      if (this.t > 3 && this.opts.caption) {
        Draw.text(ctx, this.opts.caption, W / 2, Math.max(100, v.playH * 0.16), Math.min(28, W * 0.065), '#fff', 'center', 5);
      }
    }
  }

  /* 結果画面の背景：選手のリアクション */
  class ResultScene {
    constructor(o) {
      this.o = o;
      this.t = 0;
      this.stage = new PPO.Stage(o.theme || 'day');
      this.stage.excite = o.pose === 'joy' ? 1 : 0.2;
      this.nextFw = 0.3;
    }
    controls() { return []; }
    update(dt) {
      this.t += dt;
      this.stage.update(dt);
      if (this.o.fireworks) {
        this.nextFw -= dt;
        if (this.nextFw <= 0) { this.nextFw = U.rand(0.6, 1.2); Engine.fx.firework(U.rand(Engine.W * 0.15, Engine.W * 0.85), U.rand(Engine.H * 0.06, Engine.H * 0.22)); }
      }
    }
    draw(ctx, W, H) {
      const groundY = H * 0.3;
      const L = { W, H, camX: this.t * 0.4, ppm: 40, standsTop: 0, standsBottom: H * 0.18, trackTop: H * 0.2, groundY };
      this.stage.drawBack(ctx, L);
      ctx.fillStyle = this.stage.theme.track; ctx.fillRect(0, L.trackTop, W, H - L.trackTop);
      const size = Math.min(H * 0.17, W * 0.34, 170);
      PPO.drawPug(ctx, W / 2 - size * 0.1, groundY, size, { pug: this.o.pug, pose: this.o.pose, t: this.t, number: 1, sparkle: true });
    }
  }

  PPO.CeremonyScene = CeremonyScene;
  PPO.ResultScene = ResultScene;
  PPO.drawMedal = drawMedal;
})();

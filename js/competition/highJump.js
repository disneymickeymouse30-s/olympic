/* 競技⑤ 走り高跳び */
(function () {
  'use strict';
  const PPO = window.PPO;
  const U = PPO.U, Sound = PPO.Sound, Draw = PPO.Draw, Engine = PPO.Engine, Input = PPO.Input;

  const G = 9.8;
  const RUNWAY = 14;
  const BASE = 0.55;          // 踏切時の体の高さ
  const MAT0 = 0.35, MAT1 = 3.6, MAT_H = 0.45;

  function vyFor(sr, jump) { return (2.6 + 3.5 * sr) * Math.pow(jump, 0.25); }
  function vxFor(v) { return Math.max(1.2, 0.38 * v); }
  function heightsFrom(start) {
    const hs = [];
    let h = start;
    while (h < 3.0) {
      hs.push(Math.round(h * 100) / 100);
      h += h < 1.995 ? 0.10 : h < 2.295 ? 0.05 : 0.02;
    }
    return hs;
  }

  class HighJump extends PPO.FieldBase {
    constructor(cx) {
      super('highJump', cx, { rounds: 1, theme: 'night' });
      this.maxSpeed = 8.0 * this.st.speed;
      this.tap = new PPO.TapRunner({ idealCadence: this.diff.idealCadence });
      this.body = new PPO.RunnerBody({ maxSpeed: this.maxSpeed, accel: 6.5 });
      this.heights = heightsFrom({ easy: 1.4, normal: 1.6, hard: 1.8 }[this.cx.difficulty] || 1.6);
      this.hIdx = 0;
      this.attempt = 1;
      this.consecFails = 0;
      this.bestClear = null;
      this.log = [];
      this.jumps = 0;
      this.cpuSims = this.cpus.map((c) => this.simulateCPU(c));
    }
    controls() {
      return [
        { id: 'L', label: 'ひだり', sub: '助走', cls: 'run' },
        { id: 'act', label: 'ジャンプ', sub: '空中で背面！', cls: 'act', wide: true },
        { id: 'R', label: 'みぎ', sub: '助走', cls: 'run' },
      ];
    }
    get bar() { return this.heights[this.hIdx]; }
    start() {
      Sound.playBGM('event');
      this.newAttempt();
    }
    newAttempt() {
      this.state = 'ready'; this.stateT = 0;
      this.body.x = -RUNWAY; this.body.v = 0; this.tap.reset();
      this.phase = 0; this.pose = 'idle'; this.flight = null; this.arch = null; this.barDown = 0; this.result = null;
      this.camX = -RUNWAY - 2;
      Input.setDim('act', true);
      Input.setLabel('act', 'ジャンプ<small>空中で背面！</small>');
      Input.highlight('L');
      this.fx.banner(`${this.bar.toFixed(2)}m  ${this.attempt}回目`, '#fff', 1.4, 0.65);
      if (this.jumps === 0) this.hint('交互タップで助走 → 緑の位置でジャンプ！', 3);
    }
    onInput(id, phase, tms) {
      if (phase !== 'down') return;
      if (id === 'L' || id === 'R') {
        if (this.state === 'ready' && this.stateT > 0.3) { this.state = 'run'; this.stateT = 0; Input.setDim('act', false); }
        if (this.state === 'run') { this.tap.tap(id, tms); Input.highlight(this.tap.nextSide()); }
        return;
      }
      if (id !== 'act') return;
      if (this.state === 'run') this.takeoff();
      else if (this.state === 'flight' && this.arch == null) this.archTap();
    }
    takeoff() {
      const v = this.body.v;
      const sr = U.clamp(v / this.maxSpeed, 0, 1);
      const vy = vyFor(sr, this.st.jump);
      const vx = vxFor(v);
      const x0 = this.body.x;
      const tPeak = vy / G;
      const tBar = x0 < -0.05 ? -x0 / vx : 0;
      const peak = BASE + (vy * vy) / (2 * G);
      // 判定用：踏切位置のずれによるロス（難易度で緩和）
      const dtb = (tBar - tPeak) / this.win;
      const atBar = x0 < -0.3 ? peak - 0.5 * G * dtb * dtb : 0;
      this.flight = { x0, vx, vy, t: 0, tBar, tPeak, peak, atBar, crossed: false, landed: false, v, sr };
      this.state = 'flight'; this.stateT = 0;
      this.jumps++;
      Sound.play('jump');
      Input.highlight(null);
      Input.setLabel('act', '背面！<small>バーの上で</small>');
      if (this.jumps <= 2) this.hint('バーの真上でタップ！', 1.5);
    }
    archTap() {
      const f = this.flight;
      const e = Math.abs(f.t - f.tBar);
      if (e <= 0.13 * this.win) {
        this.arch = 'good';
        Sound.play('good');
        this.fx.text(Engine.W / 2, Engine.view().playH * 0.28, '背面ナイス！', '#7fffa8', 28);
      } else {
        this.arch = 'bad';
        Sound.play('buzz');
        this.fx.text(Engine.W / 2, Engine.view().playH * 0.28, f.t < f.tBar ? 'はやい！' : 'おそい！', '#ff8a8a', 26);
      }
    }
    update(dt) {
      this.t += dt;
      if (this.hintTimer > 0) this.hintTimer -= dt;
      this.stateT += dt;
      this.stage.update(dt);
      const now = performance.now();
      switch (this.state) {
        case 'run':
          this.body.update(dt, this.tap.ratio(now));
          this.phase += this.body.v * dt * 3;
          this.pose = this.body.v > 0.3 ? 'run' : 'idle';
          if (Math.floor(this.phase / Math.PI) !== this._ls && this.body.v > 0.5) { this._ls = Math.floor(this.phase / Math.PI); Sound.play('step'); }
          if (this.body.x > -0.25) {
            // 踏み切れずにバーへ突っ込む
            this.flight = { x0: this.body.x, vx: 1.2, vy: 0.5, t: 0, tBar: 0, tPeak: 0, peak: 0, atBar: 0, crossed: false, landed: false, balk: true };
            this.state = 'flight'; this.stateT = 0; this.jumps++;
            Input.highlight(null);
          }
          break;
        case 'flight': this.updateFlight(dt); break;
        case 'result':
          if (this.stateT > 1.8) this.nextStep();
          break;
        case 'end':
          if (this.stateT > 2.0 && !this._sent) { this._sent = true; this.finishHigh(); }
          break;
        default: break;
      }
      if (this.barDown > 0) this.barDown = Math.min(1, this.barDown + dt * 3);
      const fx = this.flight ? this.flight.x0 + this.flight.vx * this.flight.t : this.body.x;
      const vw = Engine.W / this.ppm();
      const target = (this.state === 'flight' || this.state === 'result') ? Math.min(fx, 1) - vw * 0.45 : this.body.x - vw * 0.35;
      this.camX += (target - this.camX) * Math.min(1, dt * 5);
    }
    updateFlight(dt) {
      const f = this.flight;
      f.t += dt;
      const x = f.x0 + f.vx * f.t;
      if (!f.crossed && (f.t >= f.tBar || x >= 0)) {
        f.crossed = true;
        const need = this.bar + (this.arch === 'good' ? 0.03 : 0.15);
        f.success = !f.balk && f.atBar >= need;
        if (!f.success) {
          this.barDown = 0.01;
          Sound.play('hurdle');
          Engine.vibrate(80);
        }
      }
      const y = BASE + f.vy * f.t - 0.5 * G * f.t * f.t;
      f.y = y;
      const onMat = x > MAT0 - 0.2 && x < MAT1;
      const floor = onMat ? MAT_H + BASE * 0.5 : BASE;
      this.pose = f.balk ? 'fall' : f.t < 0.12 ? 'jump' : (this.arch === 'good' && Math.abs(f.t - f.tBar) < 0.3) ? 'arch' : 'air';
      if (f.t > 0.2 && y <= floor && f.vy - G * f.t < 0) {
        f.landed = true;
        f.y = floor;
        Sound.play('land');
        this.fx.shake = 4;
        this.onResult(f.success);
      }
    }
    onResult(ok) {
      this.state = 'result'; this.stateT = 0;
      this.result = ok;
      this.log.push({ h: this.bar, ok });
      if (ok) {
        this.bestClear = this.bar;
        this.consecFails = 0;
        Sound.play('cheer'); Sound.play('good');
        this.fx.banner('成功！ ○', '#7fffa8', 1.6, 0.9);
        this.stage.excite = 0.9;
        this.pose = 'joy';
        if (PPO.Score.isBetter('highJump', this.bar, PPO.Score.worldRecord('highJump').value)) this.fx.banner('世界記録!!', '#ff6b6b', 2, 0.9);
      } else {
        this.consecFails++;
        Sound.play('buzz');
        this.fx.banner(this.flight.balk ? '踏み切れず… ×' : '失敗 ×', '#ff6b6b', 1.6, 0.9);
        this.pose = 'sad';
        this.stage.excite = 0.2;
      }
    }
    nextStep() {
      if (this.result) {
        this.hIdx = Math.min(this.heights.length - 1, this.hIdx + 1);
        this.attempt = 1;
        this.newAttempt();
      } else if (this.consecFails >= 3) {
        this.state = 'end'; this.stateT = 0;
        this.fx.banner(this.bestClear ? `記録 ${this.bestClear.toFixed(2)}m` : '記録なし', '#ffd84f', 2.2, 0.9);
        this.pose = this.bestClear ? 'idle' : 'sad';
      } else {
        this.attempt++;
        this.newAttempt();
      }
    }
    // CPUのジャンプを能力に基づいてシミュレート
    simulateCPU(c) {
      const s = c.skill, stats = PPO.PUGS[c.pug].stats;
      const sr = Math.pow(s, 0.9) * (1 + U.randn() * 0.008);
      const vy = vyFor(sr, stats.jump);
      const peak = BASE + (vy * vy) / (2 * G);
      const log = [];
      let fails = 0, best = null, attempt = 1;
      for (let i = 0; i < this.heights.length && fails < 3;) {
        const h = this.heights[i];
        const e = U.randn() * (1 - s) * 0.16;
        const loss = 0.5 * G * Math.pow(2.63 * e, 2);
        const archOK = Math.random() < Math.pow(s, 1.5);
        const ok = peak - loss + U.randn() * 0.008 >= h + (archOK ? 0.03 : 0.15);
        log.push({ h, ok });
        if (ok) { best = h; fails = 0; attempt = 1; i++; }
        else { fails++; attempt++; }
      }
      return { best, log };
    }
    finishHigh() {
      const standings = [{ id: this.entry.id, name: this.entry.name, pug: this.entry.pug, levelName: this.entry.levelName, isPlayer: true, value: this.bestClear, dq: false }];
      this.cpus.forEach((c, i) => standings.push({ id: c.id, name: c.name, pug: c.pug, levelName: c.levelName, isPlayer: false, value: this.cpuSims[i].best, dq: false }));
      const okN = this.log.filter((l) => l.ok).length;
      const details = [`ジャンプ ${this.log.length}回（成功 ${okN}回）`];
      const lastOk = this.log.filter((l) => l.ok).map((l) => l.h.toFixed(2)).slice(-4);
      if (lastOk.length) details.push('成功した高さ：…' + lastOk.join(' → ') + 'm');
      this.finish({ value: this.bestClear, dq: false, reason: this.bestClear == null ? '記録なし' : null, standings, details });
    }

    // ---- 描画 ----
    ppm() { const v = Engine.view(); return v.portrait ? Engine.W / 8 : Engine.W / 15; }
    draw(ctx, W, H) {
      const v = Engine.view();
      const ppm = this.ppm();
      const groundY = v.portrait ? v.playH * 0.86 : Math.min(H - v.controlsH * 0.25 - 14, v.playH * 0.95);
      const vs = Math.min(v.pugSize * 0.95, (groundY - 110) / 2.9);
      const stripH = Math.max(24, v.pugSize * 0.3);
      const L = { W, H, ppm, camX: this.camX, groundY, trackTop: groundY - stripH, standsBottom: groundY - stripH - 24 - 2.9 * vs * 0.4, standsTop: v.portrait ? v.playH * 0.16 : 40 };
      L.standsBottom = Math.max(L.standsTop + 40, L.standsBottom);
      const sx = (x) => (x - this.camX) * ppm;
      this.stage.drawBack(ctx, L);
      ctx.fillStyle = this.stage.theme.grass2;
      ctx.fillRect(0, L.trackTop, W, H - L.trackTop);
      ctx.fillStyle = this.stage.theme.track;
      ctx.fillRect(sx(-RUNWAY - 4), L.trackTop + 4, (RUNWAY + 8) * ppm, stripH + 10);
      // 踏切ガイド
      if (this.diff.aid && (this.state === 'run' || this.state === 'ready')) {
        const vv = Math.max(this.body.v, this.maxSpeed * 0.8);
        const ideal = -(vxFor(vv) * vyFor(vv / this.maxSpeed, this.st.jump)) / G;
        const w = 0.18 * this.win * vv * 0.5;
        ctx.fillStyle = 'rgba(60,230,110,0.8)';
        ctx.fillRect(sx(ideal - w), L.trackTop + 6, Math.max(6, w * 2 * ppm), stripH + 6);
      }
      // マット
      const m0 = sx(MAT0), m1 = sx(MAT1), mh = MAT_H * vs;
      ctx.fillStyle = '#1f5fd0';
      PPO.roundRect(ctx, m0, groundY - mh, m1 - m0, mh + 8, 10); ctx.fill();
      ctx.fillStyle = '#3d7ff0';
      ctx.fillRect(m0 + 6, groundY - mh + 4, m1 - m0 - 12, mh * 0.35);
      // 支柱
      const px = sx(0);
      const barY = groundY - this.bar * vs;
      ctx.fillStyle = '#ddd';
      ctx.fillRect(px - 4, groundY - 2.7 * vs, 8, 2.7 * vs);
      // 目盛り
      for (let h = 1.0; h <= 2.6; h += 0.2) {
        const y = groundY - h * vs;
        ctx.fillStyle = '#333'; ctx.fillRect(px + 4, y - 1, 8, 2);
      }
      // パグ
      let x = this.body.x, lift = 0;
      if (this.flight) {
        const f = this.flight;
        x = f.x0 + f.vx * f.t;
        lift = Math.max(0, (f.y != null ? f.y : BASE) - BASE);
      }
      const size = v.pugSize * 0.92;
      const drawPug = () => PPO.drawPug(ctx, sx(x), groundY - lift * vs, size, {
        pug: this.entry.pug, pose: this.pose, phase: this.phase, speed: U.clamp(this.body.v / this.maxSpeed, 0, 1), t: this.t,
        number: this.entry.number, shadowLift: Math.min(0.5, lift * 0.3),
        bodyTilt: this.pose === 'arch' ? -0.35 : 0,
      });
      const drawBar = () => {
        ctx.save();
        if (this.barDown > 0) {
          ctx.translate(px, barY + this.barDown * (this.bar * vs - 6));
          ctx.rotate(this.barDown * 0.25);
          ctx.translate(-px, -barY);
        }
        const bw = Math.max(46, ppm * 0.9);
        for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#ffffff' : '#ec4646'; ctx.fillRect(px - bw / 2 + (bw / 6) * i, barY - 4, bw / 6, 8); }
        ctx.restore();
      };
      // バーの手前／奥を切り替え（横から見た奥行き表現）
      if (this.flight && this.flight.crossed) { drawBar(); drawPug(); } else { drawPug(); drawBar(); }
      Draw.text(ctx, this.bar.toFixed(2) + 'm', px + 26, barY - 16, 18, '#ffd84f', 'left', 3);
      this.fx.drawWorld(ctx, this.camX, ppm);
      this.drawHUD(ctx, W, v);
      this.drawHint(ctx, W, Math.max(L.standsTop + 30, 150));
    }
    drawHUD(ctx, W, v) {
      const top = 10 + (Engine.safeTop || 0);
      Draw.panel(ctx, 10, top, 236, 84, 'rgba(10,20,50,0.7)', 14);
      Draw.text(ctx, '走り高跳び', 22, top + 18, 16, '#ffd84f', 'left', 3);
      Draw.text(ctx, `バー ${this.bar.toFixed(2)}m  ${this.attempt}/3`, 22, top + 44, 20, '#fff', 'left', 3);
      const marks = this.log.filter((l) => l.h === this.bar).map((l) => (l.ok ? '○' : '×')).join('');
      Draw.text(ctx, `ベスト ${this.bestClear ? this.bestClear.toFixed(2) + 'm' : '—'} ${marks}`, 22, top + 68, 16, '#bfe3ff', 'left', 3);
      if (this.state === 'run') {
        const gw = Math.min(180, W * 0.36);
        Draw.gauge(ctx, W - gw - 70, top + 10, gw, 18, this.body.v / this.maxSpeed, '#4ad66d', 'SPEED');
      }
      // CPUの状況（現在の高さまで）
      const rows = this.cpus.map((c, i) => {
        const cleared = this.cpuSims[i].log.filter((l) => l.ok && l.h <= this.bar).map((l) => l.h);
        const out = this.cpuSims[i].best != null && this.cpuSims[i].best < this.bar;
        const none = this.cpuSims[i].best == null && this.cpuSims[i].log.length && this.cpuSims[i].log[0].h <= this.bar;
        return { name: c.name, best: cleared.length ? cleared[cleared.length - 1] : null, out: out || none };
      });
      const fs = v.portrait ? 13 : 12;
      const bx = W - 150, by = top + (this.state === 'run' ? 44 : 10);
      if (v.portrait || W > 700) {
        Draw.panel(ctx, bx, by, 140, rows.length * (fs + 6) + 10, 'rgba(10,20,50,0.55)', 10);
        rows.forEach((r, i) => {
          const y = by + 12 + i * (fs + 6);
          ctx.font = `800 ${fs}px sans-serif`; ctx.textBaseline = 'middle';
          ctx.textAlign = 'left'; ctx.fillStyle = r.out ? '#8892a8' : '#fff'; ctx.fillText(r.name, bx + 8, y);
          ctx.textAlign = 'right'; ctx.fillText(r.best ? r.best.toFixed(2) : '—', bx + 132, y);
        });
      }
    }
  }

  PPO.HighJumpModel = { vyFor, vxFor, heightsFrom, BASE, G };
  PPO.registerCompetition('highJump', {
    create: (cx) => new HighJump(cx),
    howto: `
      <h3>🎯 目標</h3><p>バーを越えるたびに高さが上がる。どこまで跳べるかな？</p>
      <h3>🕹 操作</h3>
      <ol>
        <li>「ひだり」「みぎ」交互タップで<b>助走</b></li>
        <li>踏切ポイント（EASY/NORMALは緑）で<b>「ジャンプ」</b></li>
        <li>空中で<b>バーの真上に来たらタップ</b> → 背面跳びの姿勢</li>
      </ol>
      <h3>💡 ルール・コツ</h3>
      <ul>
        <li>バーに当たると失敗。<b>3回連続で失敗すると終了</b></li>
        <li>助走が速いほど高く跳べるが、踏切位置も手前になる</li>
        <li>踏切が早すぎ・遅すぎると、バーの上で高さが足りなくなる</li>
        <li>背面の姿勢をとらないとお尻がバーに当たりやすい</li>
      </ul>`,
  });
})();

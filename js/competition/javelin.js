/* 競技④ やり投げ */
(function () {
  'use strict';
  const PPO = window.PPO;
  const U = PPO.U, Sound = PPO.Sound, Draw = PPO.Draw, Engine = PPO.Engine, Input = PPO.Input;

  const RUNWAY = 30;
  const G = 9.8;
  const TIME_SCALE = 1.8;   // 飛行中の早送り（待ち時間を短く）

  function aero(deg) { return U.clamp(1 - Math.pow((deg - 34) / 55, 2), 0.2, 1); }
  function releaseSpeed(power, timingF, powerStat) { return (17 + 13.6 * power) * Math.sqrt(powerStat) * timingF; }
  function timingFactor(d) { return d <= 2 ? 1 - d * 0.01 : Math.max(0.8, 0.98 - (d - 2) * 0.025); }
  function predict(power, deg, d, powerStat) {
    const v = releaseSpeed(power, timingFactor(d), powerStat);
    return (v * v * Math.sin(2 * U.rad(deg)) * aero(deg)) / G;
  }

  class Javelin extends PPO.FieldBase {
    constructor(cx) {
      super('javelin', cx, { rounds: 3, theme: 'evening' });
      this.maxSpeed = 8.2 * this.st.speed;
      this.tap = new PPO.TapRunner({ idealCadence: this.diff.idealCadence });
      this.body = new PPO.RunnerBody({ maxSpeed: this.maxSpeed, accel: 6 });
      this.period = { easy: 1.9, normal: 1.45, hard: 1.05 }[this.cx.difficulty] || 1.45;
      this.bestInfo = null;
      this.zoom = 1;
    }
    controls() {
      return [
        { id: 'L', label: 'ひだり', sub: '助走', cls: 'run' },
        { id: 'act', label: 'なげる', sub: 'もう一度で角度', cls: 'act2', wide: true },
        { id: 'R', label: 'みぎ', sub: '助走', cls: 'run' },
      ];
    }
    resetAttempt() {
      this.body.x = -RUNWAY; this.body.v = 0; this.tap.reset();
      this.phase = 0; this.pose = 'idle'; this.power = 0; this.lockedPower = 0;
      this.aimT = 0; this.angle = 0; this.proj = null; this.foul = false; this.flag = null; this.final = null;
      this.releaseD = 0; this.jav = null; this.camX = -RUNWAY - 3; this.zoom = 1; this.expr = null;
      Input.setLabel('act', 'なげる<small>パワーをためて</small>');
      Input.highlight('L');
    }
    beginRound() {
      super.beginRound();
      this.hint('交互タップで助走！ パワーをためよう', 2.5);
    }
    onFieldInput(id, phase, tms) {
      if (phase !== 'down') return;
      if (id === 'L' || id === 'R') {
        if (this.state === 'ready') { this.state = 'run'; this.stateT = 0; Input.setDim('act', false); }
        if (this.state === 'run') { this.tap.tap(id, tms); Input.highlight(this.tap.nextSide()); }
        return;
      }
      if (id !== 'act') return;
      if (this.state === 'run') {
        this.state = 'aim'; this.stateT = 0; this.aimT = 0;
        this.lockedPower = Math.pow(this.power, 1.15);
        Input.setLabel('act', 'リリース！<small>角度を決める</small>');
        Input.highlight(null);
        Sound.play('beep');
        if (this.round === 1) this.hint('ちょうどいい角度でタップ！', 2);
      } else if (this.state === 'aim') {
        this.release();
      }
    }
    release() {
      const d = -this.body.x;
      this.releaseD = d;
      this.foul = d < 0;
      const tf = timingFactor(Math.max(0, d));
      const v = releaseSpeed(this.lockedPower, tf, this.st.power);
      const deg = this.angle;
      this.proj = new PPO.Projectile(this.body.x + 0.5, 1.6, v * Math.cos(U.rad(deg)) * aero(deg), v * Math.sin(U.rad(deg)), G);
      this.relDeg = deg;
      this._landAng = 0.35;
      this.state = 'flight'; this.stateT = 0;
      this.pose = 'throw';
      Sound.play('throw');
      Engine.vibrate(40);
      const q = d < 0 ? null : d <= 1.5 ? 'リリース ◎' : d <= 4 ? 'リリース ○' : 'リリース △（線まで遠い）';
      if (q) this.fx.text(Engine.W / 2, Engine.view().playH * 0.3, q, d <= 1.5 ? '#ffd84f' : '#fff', 24);
    }
    update(dt) {
      super.update(dt);
      const now = performance.now();
      switch (this.state) {
        case 'run': {
          this.body.update(dt, this.tap.ratio(now));
          this.phase += this.body.v * dt * 3.2;
          this.power += (this.body.v / this.maxSpeed - this.power) * Math.min(1, dt * 1.6);
          this.pose = this.body.v > 0.3 ? 'run' : 'idle';
          this.stepSound();
          if (this.body.x > 1.0) { this.release(); }
          break;
        }
        case 'aim':
          this.aimT += dt;
          this.angle = 40 - 40 * Math.cos((this.aimT / this.period) * Math.PI * 2);
          this.body.v = Math.max(0, this.body.v - 11 * dt); // 踏ん張ってブレーキ
          this.body.x += this.body.v * dt;
          this.phase += this.body.v * dt * 3;
          this.pose = 'windup';
          if (this.aimT > this.period * 2.2) this.release();
          break;
        case 'flight': {
          const sdt = dt * TIME_SCALE;
          this.proj.update(sdt);
          this.body.v = Math.max(0, this.body.v - 6 * dt);
          this.body.x += this.body.v * dt;
          if (this.stateT > 0.35) this.pose = 'idle';
          this.zoom += (0.45 - this.zoom) * Math.min(1, dt * 2);
          if (this.proj.landed) this.onLand();
          break;
        }
        case 'landed':
          if (this.stateT > 0.6) this.pose = this.final != null && this.final >= (this.marks[this.entry.id].best || 0) ? 'joy' : this.foul ? 'sad' : 'idle';
          if (this.stateT > 2.4) { this.recordPlayer(this.final); this.showBoard(); }
          break;
        default: break;
      }
      const ppm = this.ppm();
      const vw = Engine.W / ppm;
      const target = this.state === 'flight' || this.state === 'landed' ? (this.proj ? this.proj.x : this.body.x) - vw * 0.55 : this.body.x - vw * 0.35;
      this.camX += (target - this.camX) * Math.min(1, dt * (this.state === 'flight' ? 7 : 5));
    }
    stepSound() {
      const k = Math.floor(this.phase / Math.PI);
      if (k !== this._lastStep && this.body.v > 0.5) { this._lastStep = k; Sound.play('step'); }
    }
    onLand() {
      this.state = 'landed'; this.stateT = 0;
      Sound.play('stick');
      this.fx.dust(this.proj.x, this._groundY || 400, 12, 'rgba(120,80,40,0.8)', 2);
      if (this.foul) {
        this.final = null; this.flag = 'red';
        Sound.play('whistle');
        this.fx.banner('ファウル', '#ff6b6b', 1.6, 0.9);
      } else {
        this.final = Math.floor(this.proj.x * 100) / 100;
        this.flag = 'white';
        this.fx.banner(this.final.toFixed(2) + 'm', '#ffd84f', 2.0, 1.1);
        Sound.play('cheer');
        this.stage.excite = 0.9;
        if (!this.bestInfo || this.final > this.bestInfo.d) {
          this.bestInfo = { d: this.final, power: this.lockedPower, deg: this.relDeg, rel: this.releaseD };
        }
      }
    }
    cpuAttempt(c) {
      const s = c.skill;
      const stats = PPO.PUGS[c.pug].stats;
      const power = U.clamp(Math.pow(s, 1.6) * (1 + U.randn() * 0.015), 0.3, 1);
      const deg = U.clamp(41 + U.randn() * (1 - s) * 32, 8, 75);
      const off = 0.7 + U.randn() * (1 - s) * 2.4 - (1 - s) * 0.4;
      if (off < 0) return null;
      return Math.floor(Math.max(5, predict(power, deg, off, stats.power)) * 100) / 100;
    }
    extraDetails(d) {
      const b = this.bestInfo;
      if (!b) return;
      d.push(`ベスト試技：パワー ${Math.round(b.power * 100)}% ／ 角度 ${b.deg.toFixed(0)}° ／ 線まで ${b.rel.toFixed(1)}m`);
    }

    // ---- 描画 ----
    ppm() { const v = Engine.view(); return (v.portrait ? Engine.W / 9 : Engine.W / 16) * this.zoom; }
    draw(ctx, W, H) {
      const v = Engine.view();
      const ppm = this.ppm();
      const groundY = v.portrait ? v.playH * 0.84 : Math.min(H - v.controlsH * 0.25 - 14, v.playH * 0.95);
      this._groundY = groundY;
      const stripH = Math.max(26, v.pugSize * 0.35);
      const L = { W, H, ppm, camX: this.camX, groundY, trackTop: groundY - stripH, standsBottom: groundY - stripH - 24, standsTop: v.portrait ? v.playH * 0.2 : 50 };
      const sx = (x) => (x - this.camX) * ppm;
      this.stage.drawBack(ctx, L);
      ctx.fillStyle = this.stage.theme.grass;
      ctx.fillRect(0, L.trackTop, W, H - L.trackTop);
      // 芝の縞
      ctx.fillStyle = this.stage.theme.grass2;
      for (let m = 0; m < 110; m += 10) { const a = sx(m), b = sx(m + 5); if (b > 0 && a < W) ctx.fillRect(a, L.trackTop, b - a, H - L.trackTop); }
      // 助走路
      const r0 = sx(-RUNWAY - 4), r1 = sx(0);
      ctx.fillStyle = this.stage.theme.track;
      ctx.fillRect(r0, L.trackTop + 4, r1 - r0, stripH + 10);
      // ファウルライン
      ctx.fillStyle = '#fff'; ctx.fillRect(r1 - 3, L.trackTop - 4, 6, stripH + 22);
      // 距離ライン
      for (let m = 10; m <= 100; m += 10) {
        const x = sx(m);
        if (x < -40 || x > W + 40) continue;
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x - 1.5, L.trackTop, 3, stripH + 18);
        Draw.text(ctx, m + 'm', x, L.trackTop - 14, 15, '#fff', 'center', 3);
      }
      const wr = PPO.Score.worldRecord('javelin').value;
      const pb = PPO.Save.data.records.javelin.best;
      const flagLine = (d, col, label) => {
        const x = sx(d); if (x < -30 || x > W + 30) return;
        ctx.fillStyle = col; ctx.fillRect(x - 2, L.trackTop - 30, 4, stripH + 48);
        Draw.text(ctx, label, x, L.trackTop - 38, 14, col, 'center', 3);
      };
      if (pb) flagLine(pb, '#7fe0ff', 'PB');
      flagLine(wr, '#ff6b6b', 'WR');
      // 審判
      this.drawJudge(ctx, sx(-2.5), L.trackTop - 2, v.pugSize * 0.5, this.state === 'landed' ? this.flag : null);

      const size = v.pugSize * (0.75 + 0.25 * this.zoom);
      const holding = this.state === 'ready' || this.state === 'run' || this.state === 'aim';
      PPO.drawPug(ctx, sx(this.body.x), groundY, size, {
        pug: this.entry.pug, pose: this.pose, phase: this.phase, speed: U.clamp(this.body.v / this.maxSpeed, 0, 1), t: this.t,
        number: this.entry.number, item: holding ? 'javelin' : null,
        itemAngle: this.state === 'aim' ? -U.rad(this.angle) : -0.32,
      });
      // やり（飛行中・着地後）
      if (this.proj) {
        const vs = Math.min(ppm, (groundY - 90) / 22);
        const jx = sx(this.proj.x), jy = groundY - this.proj.y * vs;
        let ang = this.proj.landed ? this._landAng : Math.atan2(-this.proj.vy * vs / ppm, this.proj.vx);
        if (!this.proj.landed) this._landAng = Math.max(ang, 0.35);
        this.drawJav(ctx, jx, jy, Math.max(46, ppm * 2.4), ang);
        if (this.state === 'landed' && this.final != null) {
          Draw.panel(ctx, jx - 52, groundY + 14, 104, 34, 'rgba(255,255,255,0.95)', 10);
          ctx.fillStyle = '#1d4a8c'; ctx.font = '900 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(this.final.toFixed(2) + 'm', jx, groundY + 32);
        }
      }
      this.fx.drawWorld(ctx, this.camX, ppm);
      if (this.state === 'aim') this.drawAimGauge(ctx, sx(this.body.x) + size * 0.3, groundY - size * 0.9, size * 1.1);
      this.drawHUD(ctx, W);
      this.drawHint(ctx, W, Math.max(L.standsTop + 30, 140));
      this.drawBoardOverlay(ctx, W, H);
    }
    drawJav(ctx, x, y, len, ang) {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(ang);
      ctx.strokeStyle = 'rgba(30,20,20,0.9)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.strokeStyle = '#efe7d6'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.strokeStyle = '#ec4646'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-len * 0.55, 0); ctx.lineTo(-len * 0.42, 0); ctx.stroke();
      ctx.fillStyle = '#444'; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(9, 0); ctx.lineTo(0, 3); ctx.fill();
      ctx.restore();
    }
    drawAimGauge(ctx, x, y, r) {
      ctx.save();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, -U.rad(80), 0); ctx.closePath();
      ctx.fillStyle = 'rgba(10,20,50,0.6)'; ctx.fill();
      if (this.diff.aid) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, -U.rad(45), -U.rad(37)); ctx.closePath();
        ctx.fillStyle = 'rgba(60,230,110,0.8)'; ctx.fill();
      }
      ctx.strokeStyle = '#ffd84f'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(-U.rad(this.angle)) * r, y + Math.sin(-U.rad(this.angle)) * r); ctx.stroke();
      ctx.restore();
      Draw.text(ctx, Math.round(this.angle) + '°', x + r * 0.6, y - r * 0.12, 26, '#fff', 'center', 4);
      const d = -this.body.x;
      Draw.text(ctx, d >= 0 ? `ラインまで ${d.toFixed(1)}m` : 'ライン越え！', x + r * 0.4, y + 26, 17, d < 0 ? '#ff6b6b' : '#ffd84f', 'center', 3);
    }
    drawHUD(ctx, W) {
      const top = 10 + (Engine.safeTop || 0);
      Draw.panel(ctx, 10, top, 220, 58, 'rgba(10,20,50,0.7)', 14);
      Draw.text(ctx, `やり投げ  ${Math.min(this.round, this.rounds)}/${this.rounds}`, 22, top + 18, 16, '#ffd84f', 'left', 3);
      const best = this.marks[this.entry.id].best;
      Draw.text(ctx, 'ベスト ' + (best == null ? '—' : best.toFixed(2) + 'm'), 22, top + 42, 20, '#fff', 'left', 3);
      if (this.state === 'run' || this.state === 'aim') {
        const gw = Math.min(190, W * 0.38);
        const p = this.state === 'aim' ? this.lockedPower : this.power;
        Draw.gauge(ctx, W - gw - 70, top + 10, gw, 20, p, p > 0.92 ? '#ff5a3c' : '#ffb03a', 'POWER');
        if (this.state === 'run') {
          const toLine = -this.body.x;
          Draw.text(ctx, `ラインまで ${Math.max(0, toLine).toFixed(1)}m`, W - 70 - gw / 2, top + 50, 16, toLine < 6 ? '#ffd84f' : '#fff', 'center', 3);
        }
      }
    }
  }

  PPO.JavelinModel = { predict, releaseSpeed, timingFactor, aero };
  PPO.registerCompetition('javelin', {
    create: (cx) => new Javelin(cx),
    howto: `
      <h3>🎯 目標</h3><p>3回の試技で、やりをいちばん遠くへ投げよう！</p>
      <h3>🕹 操作</h3>
      <ol>
        <li>「ひだり」「みぎ」交互タップで<b>助走</b> → パワーゲージがたまる</li>
        <li>ファウルラインの手前で<b>「なげる」</b></li>
        <li>角度メーターが動く → ちょうどいい角度で<b>もう一度タップ</b></li>
        <li>やりが飛んで、着地点の距離が記録になる</li>
      </ol>
      <h3>💡 評価ポイント</h3>
      <ul>
        <li>助走速度（パワー）・投射角度・リリースのタイミング</li>
        <li>40°前後が飛びやすい（EASY/NORMALは緑のゾーン）</li>
        <li>ラインに近いところで投げるほど◎。越えたら<b>ファウル</b></li>
        <li>角度を決めている間も体は少し前に進む。ラインの3〜5m手前で「なげる」がおすすめ</li>
      </ul>`,
  });
})();

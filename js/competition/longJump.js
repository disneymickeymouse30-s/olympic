/* 競技③ 走り幅跳び */
(function () {
  'use strict';
  const PPO = window.PPO;
  const U = PPO.U, Sound = PPO.Sound, Draw = PPO.Draw, Engine = PPO.Engine, Input = PPO.Input;

  const G = 12.2;          // ゲーム用重力（爽快感重視で調整）
  const RUNWAY = 38;       // 助走路の長さ
  const PIT_END = 10.5;
  const POSTURE = { perfect: 0.04, good: 0.02 };

  // 物理モデル（プレイヤーとCPUで共通）
  function launchSpeed(v, deg, jump) { return v * (0.78 + 0.12 * Math.cos(U.rad(deg))) * Math.sqrt(jump); }
  function predictDistance(v, deg, off, postureQ, goodLanding, jump) {
    const vl = launchSpeed(v, deg, jump);
    let r = (vl * vl * Math.sin(2 * U.rad(deg))) / G;
    r *= 1 + (POSTURE[postureQ] || 0);
    return r - off + (goodLanding ? 0.22 : -0.12);
  }

  class LongJump extends PPO.FieldBase {
    constructor(cx) {
      super('longJump', cx, { rounds: 3, theme: 'field' });
      this.maxSpeed = 11.6 * this.st.speed;
      this.tap = new PPO.TapRunner({ idealCadence: this.diff.idealCadence });
      this.body = new PPO.RunnerBody({ maxSpeed: this.maxSpeed });
      this.angleRate = { easy: 62, normal: 78, hard: 96 }[this.cx.difficulty] || 78;
      this.bestInfo = null;
    }
    controls() {
      return [
        { id: 'L', label: 'ひだり', sub: '助走', cls: 'run' },
        { id: 'act', label: 'ジャンプ', sub: '長押しで角度', cls: 'act', wide: true },
        { id: 'R', label: 'みぎ', sub: '助走', cls: 'run' },
      ];
    }
    resetAttempt() {
      this.body.x = -RUNWAY; this.body.v = 0;
      this.tap.reset();
      this.phase = 0; this.pose = 'idle';
      this.angle = 0; this.holdT = 0;
      this.proj = null; this.flightT = 0;
      this.postureQ = null; this.postureDone = false; this.landDone = false; this.goodLanding = false;
      this.foul = false; this.flag = null; this.final = null; this.takeoffX = null; this.takeoffV = 0;
      this.landedT = 0; this.expr = null;
      this.camX = -RUNWAY - 2;
      Input.setLabel('act', 'ジャンプ<small>長押しで角度</small>');
      Input.highlight('L');
    }
    beginRound() {
      super.beginRound();
      this.hint('交互タップで助走スタート！', 2.5);
    }
    onFieldInput(id, phase, tms) {
      if (phase === 'down' && (id === 'L' || id === 'R')) {
        if (this.state === 'ready') { this.state = 'run'; this.stateT = 0; Input.setDim('act', false); }
        if (this.state === 'run') { this.tap.tap(id, tms); Input.highlight(this.tap.nextSide()); }
        return;
      }
      if (id !== 'act') return;
      if (phase === 'down') {
        if (this.state === 'run') this.beginTakeoff();
        else if (this.state === 'flight') this.airTap();
      } else if (phase === 'up') {
        if (this.state === 'angle') this.launch();
      }
    }
    beginTakeoff() {
      this.state = 'angle';
      this.stateT = 0;
      this.holdT = 0;
      this.takeoffX = this.body.x;
      this.takeoffV = this.body.v;
      Sound.play('beep');
      Input.highlight(null);
    }
    launch() {
      if (this.state !== 'angle') return;
      const deg = this.angle;
      const vl = launchSpeed(this.takeoffV, deg, this.st.jump);
      this.proj = new PPO.Projectile(this.takeoffX, 0, vl * Math.cos(U.rad(deg)), vl * Math.sin(U.rad(deg)), G);
      this.apexT = this.proj.vy / G;
      this.totalT = (2 * this.proj.vy) / G;
      this.foul = this.takeoffX > 0;
      this.state = 'flight';
      this.stateT = 0;
      this.launchDeg = deg;
      Sound.play('jump');
      Input.setLabel('act', '姿勢！<small>頂点と着地で</small>');
      if (this.round === 1) this.hint('いちばん高い所でタップ→着地直前にもう一度！', 2.6);
    }
    airTap() {
      const t = this.proj.t;
      const w = this.win;
      if (!this.postureDone && t < this.apexT + 0.22 * w) {
        this.postureDone = true;
        const e = Math.abs(t - this.apexT);
        if (e <= 0.085 * w) {
          this.postureQ = 'perfect'; this.proj.vx *= 1 + POSTURE.perfect * 2;
          Sound.play('perfect'); this.fx.text(Engine.W / 2, Engine.view().playH * 0.3, '姿勢 PERFECT!', '#ffd84f', 30);
        } else if (e <= 0.19 * w) {
          this.postureQ = 'good'; this.proj.vx *= 1 + POSTURE.good * 2;
          Sound.play('good'); this.fx.text(Engine.W / 2, Engine.view().playH * 0.3, '姿勢 GOOD', '#7fe0ff', 28);
        } else {
          this.postureQ = 'miss';
          Sound.play('buzz'); this.fx.text(Engine.W / 2, Engine.view().playH * 0.3, 'はやい！', '#ff8a8a', 26);
        }
        return;
      }
      if (!this.landDone) {
        this.postureDone = true;
        this.landDone = true;
        const remain = this.totalT - t;
        if (remain > 0 && remain <= 0.17 * w) {
          this.goodLanding = true;
          Sound.play('good'); this.fx.text(Engine.W / 2, Engine.view().playH * 0.36, '着地ナイス！', '#7fffa8', 28);
        } else {
          this.fx.text(Engine.W / 2, Engine.view().playH * 0.36, '着地はやい…', '#ff8a8a', 24);
        }
      }
    }
    update(dt) {
      super.update(dt);
      const now = performance.now();
      switch (this.state) {
        case 'ready':
          this.pose = 'idle';
          break;
        case 'run': {
          this.body.update(dt, this.tap.ratio(now));
          this.phase += this.body.v * dt * 2.9;
          this.pose = this.body.v > this.maxSpeed * 0.88 ? 'sprint' : this.body.v > 0.3 ? 'run' : 'idle';
          this.stepSound();
          if (this.body.x > 0.6) {
            // 踏み切らずに線を越えた
            this.foul = true; this.flag = 'red';
            this.state = 'landed'; this.stateT = 0; this.final = null; this.pose = 'sad';
            Sound.play('whistle');
            this.fx.banner('ファウル', '#ff6b6b', 1.6, 0.9);
          }
          if (this.diff.aid && this.body.x > -9 && this.body.x < -3 && this.round === 1) this.hint('踏切板の手前でジャンプ！', 1);
          break;
        }
        case 'angle':
          this.holdT += dt;
          this.angle = Math.min(70, 4 + this.angleRate * this.holdT);
          this.phase += dt * 3;
          this.pose = 'jump';
          if (this.angle >= 70) this.launch();
          break;
        case 'flight':
          this.proj.update(dt);
          this.pose = this.proj.t < this.totalT * 0.2 ? 'jump' : (this.postureQ === 'perfect' || this.postureQ === 'good') && this.proj.t > this.apexT - 0.1 ? 'air' : 'air';
          if (this.proj.landed) this.onLand();
          break;
        case 'landed':
          this.landedT += dt;
          if (this.stateT > 2.2) this.afterAttempt();
          break;
        default: break;
      }
      const target = this.state === 'flight' ? this.proj.x : this.state === 'landed' && this.final != null ? this.final : this.body.x;
      const vw = Engine.W / this.ppm();
      this.camX += (target - vw * 0.38 - this.camX) * Math.min(1, dt * 5);
    }
    stepSound() {
      const k = Math.floor(this.phase / Math.PI);
      if (k !== this._lastStep && this.body.v > 0.5) { this._lastStep = k; Sound.play('step', { pitch: 0.95 + Math.random() * 0.1 }); }
    }
    onLand() {
      const xl = this.proj.x;
      this.state = 'landed';
      this.stateT = 0;
      this.landedT = 0;
      const adj = this.goodLanding ? 0.22 : -0.12;
      this.body.x = xl + adj;
      this.pose = this.goodLanding ? 'land' : 'belly';
      Sound.play('sand');
      this.fx.dust(xl, this._groundY || 400, 22, 'rgba(240,210,150,0.95)', 3);
      this.fx.shake = 5;
      if (this.foul) {
        this.flag = 'red';
        this.final = null;
        Sound.play('whistle');
        this.fx.banner('ファウル', '#ff6b6b', 1.6, 0.9);
        this.expr = 'sad';
      } else {
        this.flag = 'white';
        this.final = Math.floor((this.body.x) * 100) / 100;
        const isPB = this.marks[this.entry.id].best == null || this.final > this.marks[this.entry.id].best;
        this.fx.banner(this.final.toFixed(2) + 'm', '#ffd84f', 2.0, 1.1);
        if (isPB && this.round > 1) this.fx.text(Engine.W / 2, Engine.view().playH * 0.48, 'ベスト更新！', '#ff9bb8', 26);
        if (!this.bestInfo || this.final > this.bestInfo.d) {
          this.bestInfo = { d: this.final, v: this.takeoffV, deg: this.launchDeg, off: -this.takeoffX, posture: this.postureQ, land: this.goodLanding };
        }
      }
    }
    afterAttempt() {
      if (this.state !== 'landed') return;
      this.recordPlayer(this.final);
      this.showBoard();
    }
    cpuAttempt(c) {
      const s = c.skill;
      const stats = PPO.PUGS[c.pug].stats;
      const v = 11.6 * stats.speed * Math.pow(s, 0.9) * (1 + U.randn() * 0.01);
      const off = 0.04 + Math.abs(U.randn()) * (1 - s) * 0.6;
      const foul = U.randn() * (1 - s) * 0.9 > 0.12 + s * 0.05;
      if (foul) return null;
      const deg = U.clamp(41 + U.randn() * (1 - s) * 30, 12, 65);
      const pr = Math.random();
      const posture = pr < s * s * 0.9 ? 'perfect' : pr < s ? 'good' : 'miss';
      const land = Math.random() < s * 0.95;
      return Math.floor(Math.max(1, predictDistance(v, deg, off, posture, land, stats.jump)) * 100) / 100;
    }
    extraDetails(d) {
      const b = this.bestInfo;
      if (!b) return;
      d.push(`ベスト試技：助走 ${(b.v * 3.6).toFixed(1)}km/h ／ 角度 ${b.deg.toFixed(0)}° ／ 踏切のロス ${(b.off * 100).toFixed(0)}cm`);
      d.push(`空中姿勢：${b.posture === 'perfect' ? 'PERFECT' : b.posture === 'good' ? 'GOOD' : 'なし'} ／ 着地：${b.land ? 'ナイス' : 'おなか着地'}`);
    }

    // ---- 描画 ----
    ppm() { const v = Engine.view(); return v.portrait ? Engine.W / 8.5 : Engine.W / 16; }
    draw(ctx, W, H) {
      const v = Engine.view();
      const ppm = this.ppm();
      const groundY = v.portrait ? v.playH * 0.84 : Math.min(H - v.controlsH * 0.25 - 14, v.playH * 0.95);
      this._groundY = groundY;
      const stripH = Math.max(26, v.pugSize * 0.35);
      const L = { W, H, ppm, camX: this.camX, groundY, trackTop: groundY - stripH, standsBottom: groundY - stripH - 24, standsTop: v.portrait ? v.playH * 0.2 : 50 };
      const sx = (x) => (x - this.camX) * ppm;
      this.stage.drawBack(ctx, L);
      // 地面
      ctx.fillStyle = this.stage.theme.grass2;
      ctx.fillRect(0, L.trackTop, W, H - L.trackTop);
      // 助走路
      const r0 = sx(-RUNWAY - 3), r1 = sx(1.0);
      ctx.fillStyle = this.stage.theme.track;
      ctx.fillRect(r0, L.trackTop + 4, r1 - r0, stripH + 10);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(r0, L.trackTop + 4, r1 - r0, 3);
      ctx.fillRect(r0, L.trackTop + stripH + 11, r1 - r0, 3);
      // 砂場
      const p0 = sx(1.0), p1 = sx(PIT_END);
      ctx.fillStyle = '#e9cf98';
      PPO.roundRect(ctx, p0, L.trackTop, p1 - p0, stripH + 18, 10); ctx.fill();
      ctx.fillStyle = 'rgba(200,170,110,0.6)';
      for (let i = 0; i < 30; i++) ctx.fillRect(p0 + ((i * 53.7) % Math.max(1, p1 - p0)), L.trackTop + 6 + ((i * 17) % (stripH)), 4, 2);
      // 距離目盛り
      for (let m = 2; m <= 10; m++) {
        const x = sx(m);
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(x - 1, L.trackTop - 8, 2, 10);
        Draw.text(ctx, m + 'm', x, L.trackTop - 18, 14, '#fff', 'center', 3);
      }
      // 世界記録・自己ベストのライン
      const wr = PPO.Score.worldRecord('longJump').value;
      const pb = PPO.Save.data.records.longJump.best;
      const flagLine = (d, col, label) => {
        const x = sx(d);
        ctx.fillStyle = col; ctx.fillRect(x - 2, L.trackTop - 2, 4, stripH + 20);
        Draw.text(ctx, label, x, L.trackTop + stripH + 32, 13, col, 'center', 3);
      };
      if (pb) flagLine(pb, '#7fe0ff', 'PB');
      flagLine(wr, '#ff6b6b', 'WR');
      // 踏切板
      const b0 = sx(-0.2), b1 = sx(0);
      ctx.fillStyle = '#fff'; ctx.fillRect(b0, L.trackTop + 6, b1 - b0, stripH + 6);
      ctx.fillStyle = '#5a8f3a'; ctx.fillRect(b1, L.trackTop + 6, Math.max(3, ppm * 0.1), stripH + 6);
      // 審判
      this.drawJudge(ctx, sx(-1.6), L.trackTop - 2, v.pugSize * 0.55, this.state === 'landed' ? this.flag : null);
      // 着地痕
      if (this.state === 'landed' && this.final != null) {
        const x = sx(this.final);
        ctx.fillStyle = '#ffd84f'; ctx.fillRect(x - 2, L.trackTop - 30, 4, 40);
      }
      // パグ
      let px = this.body.x, lift = 0;
      if (this.state === 'flight') { px = this.proj.x; lift = this.proj.y; }
      const size = v.pugSize;
      const liftPx = lift * ppm * 0.75;
      PPO.drawPug(ctx, sx(px), groundY - liftPx, size, {
        pug: this.entry.pug, pose: this.pose, phase: this.phase, speed: U.clamp(this.body.v / this.maxSpeed, 0, 1), t: this.t,
        number: this.entry.number, shadowLift: Math.min(0.5, lift * 0.25), bodyTilt: this.state === 'flight' ? -0.3 + this.proj.t * 0.4 : 0,
        expr: this.state === 'landed' ? (this.final != null && this.goodLanding ? 'happy' : this.foul ? 'sad' : 'dizzy') : null,
        bellyJiggle: this.state === 'landed' ? Math.max(0, 1 - this.landedT) : 0,
      });
      this.fx.drawWorld(ctx, this.camX, ppm);
      // 角度ゲージ
      if (this.state === 'angle') this.drawAngleGauge(ctx, sx(px) + size * 0.2, groundY - size * 0.8, size * 1.1);
      this.drawHUD(ctx, W, v);
      this.drawHint(ctx, W, Math.max(L.standsTop + 30, 140));
      this.drawBoardOverlay(ctx, W, H);
    }
    drawAngleGauge(ctx, x, y, r) {
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, -U.rad(75), 0); ctx.closePath();
      ctx.fillStyle = 'rgba(10,20,50,0.6)'; ctx.fill();
      if (this.diff.aid) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, -U.rad(46), -U.rad(37)); ctx.closePath();
        ctx.fillStyle = 'rgba(60,230,110,0.75)'; ctx.fill();
      }
      ctx.strokeStyle = '#ffd84f'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(-U.rad(this.angle)) * r, y + Math.sin(-U.rad(this.angle)) * r); ctx.stroke();
      Draw.text(ctx, Math.round(this.angle) + '°', x + r * 0.55, y - r * 0.15, 26, '#fff', 'center', 4);
      ctx.restore();
      Draw.text(ctx, '離して踏切！', x + r * 0.4, y + 26, 18, '#ffd84f', 'center', 3);
    }
    drawHUD(ctx, W, v) {
      const top = 10 + (Engine.safeTop || 0);
      Draw.panel(ctx, 10, top, 220, 58, 'rgba(10,20,50,0.7)', 14);
      Draw.text(ctx, `走り幅跳び  ${Math.min(this.round, this.rounds)}/${this.rounds}`, 22, top + 18, 16, '#ffd84f', 'left', 3);
      const best = this.marks[this.entry.id].best;
      Draw.text(ctx, 'ベスト ' + (best == null ? '—' : best.toFixed(2) + 'm'), 22, top + 42, 20, '#fff', 'left', 3);
      if (this.state === 'run' || this.state === 'angle') {
        const gw = Math.min(180, W * 0.36);
        Draw.gauge(ctx, W - gw - 70, top + 10, gw, 18, this.body.v / this.maxSpeed, '#4ad66d', 'SPEED');
        const toBoard = -this.body.x;
        Draw.text(ctx, toBoard > 0 ? `踏切まで ${toBoard.toFixed(1)}m` : '踏切線！', W - 70 - gw / 2, top + 48, 16, toBoard < 3 ? '#ffd84f' : '#fff', 'center', 3);
      }
    }
  }

  PPO.LongJumpModel = { predictDistance, launchSpeed, G };
  PPO.registerCompetition('longJump', {
    create: (cx) => new LongJump(cx),
    howto: `
      <h3>🎯 目標</h3><p>3回の試技で、いちばん遠くまで跳ぼう！</p>
      <h3>🕹 操作</h3>
      <ol>
        <li>「ひだり」「みぎ」交互タップで<b>助走</b></li>
        <li>踏切板の手前で<b>「ジャンプ」を長押し</b> → 角度が上がる</li>
        <li><b>指を離すと踏切</b>（40°前後がおすすめ）</li>
        <li>空中で<b>いちばん高い所</b>でタップ → 空中姿勢</li>
        <li><b>着地の直前</b>にもう一度タップ → 足を前に出して着地</li>
      </ol>
      <h3>💡 評価ポイント</h3>
      <ul>
        <li>助走速度・踏切位置・ジャンプ角度・空中姿勢・着地</li>
        <li>踏切線を越えると<b>ファウル</b>（記録なし）</li>
        <li>線ギリギリで踏み切るほど記録がのびる</li>
        <li>着地タップを忘れると、砂場にお腹から着地…</li>
      </ul>`,
  });
})();

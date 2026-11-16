/* 競技② 110mハードル */
(function () {
  'use strict';
  const PPO = window.PPO;
  const U = PPO.U, Sound = PPO.Sound, Draw = PPO.Draw, Engine = PPO.Engine;

  const HURDLES = Array.from({ length: 10 }, (_, i) => 13.72 + i * 9.14);
  const JUMP_T = 0.44;   // 滞空時間（秒）

  class Hurdles110 extends PPO.RaceBase {
    constructor(cx) {
      super('hurdles110', cx, { distance: 110, theme: 'afternoon', maxSpeed: 11.2 });
      // ハードルを越えられる高さのしきい値（難易度・テクニックで変化）
      this.thr = U.clamp(1 - 0.3 * this.win, 0.45, 0.86);
      this.perfW = 0.085 * this.win;
      this.combo = 0; this.maxCombo = 0;
      this.stats = { perfect: 0, good: 0, hit: 0, fall: 0, wasted: 0 };
    }
    controls() {
      return [
        { id: 'L', label: 'ひだり', sub: '走る', cls: 'run' },
        { id: 'act', label: 'ジャンプ', sub: 'ハードル', cls: 'act', wide: true },
        { id: 'R', label: 'みぎ', sub: '走る', cls: 'run' },
      ];
    }
    resetStart() {
      super.resetStart();
      this.athletes.forEach((a) => {
        a.air = false; a.airT = 0; a.landT = 0; a.nextH = 0; a.knocked = HURDLES.map(() => 0); a.plan = null; a.fallT = 0; a.grace = 0; a.prevX = 0;
      });
    }
    onAction(id) {
      if (id !== 'act' || this.state !== 'run') return;
      const a = this.player;
      if (a.air || a.fallT > 0 || a.finished) return;
      this.doJump(a);
    }
    canRun() { return !this.player.air && this.player.fallT <= 0; }
    doJump(a) {
      a.air = true; a.airT = 0;
      a.jumpTarget = a.nextH < HURDLES.length ? HURDLES[a.nextH] : null;
      if (a.isPlayer) Sound.play('jump');
    }
    playerRatio(now) { return this.tap.ratio(now); }

    updatePlayer(a, dt, now) {
      if (a.finished) { super.updatePlayer(a, dt, now); return; }
      this.physics(a, dt, () => this.tap.ratio(now));
      this.topSpeed = Math.max(this.topSpeed, a.body.v);
      if (a.isPlayer && a.nextH < HURDLES.length && !a.air && this.hints && this.raceT < 6 && HURDLES[a.nextH] - a.body.x < 6 && HURDLES[a.nextH] - a.body.x > 4) {
        this.hint('緑のゾーンでジャンプ！', 1.0);
      }
    }
    updateCPU(a, dt) {
      if (a.finished) { super.updateCPU(a, dt); return; }
      // 次のハードルの踏切位置を、能力に応じた誤差つきで計画
      if (!a.air && a.fallT <= 0 && a.nextH < HURDLES.length) {
        const h = HURDLES[a.nextH];
        if (a.plan == null || a.planFor !== a.nextH) {
          const err = U.randn() * (1 - a.skill) * 0.55;
          a.plan = 0.5 + err; a.planFor = a.nextH;
        }
        const takeX = h - a.body.v * JUMP_T * a.plan;
        if (a.body.x >= takeX && a.body.v > 2) this.doJump(a);
      }
      this.physics(a, dt, () => this.cpuRatio(a, this.raceT));
    }

    physics(a, dt, ratioFn) {
      a.prevX = a.body.x;
      if (a.fallT > 0) {
        a.fallT -= dt;
        a.body.v = Math.max(0, a.body.v - 9 * dt);
        a.body.x += a.body.v * dt;
        a.pose = 'fall';
        if (a.fallT <= 0) { a.pose = 'auto'; a.expr = null; }
      } else if (a.air) {
        a.airT += dt;
        a.body.v *= 1 - 0.02 * dt;
        a.body.x += a.body.v * dt;
        a.pose = a.airT < JUMP_T * 0.3 ? 'jump' : 'air';
        if (a.airT >= JUMP_T) this.land(a);
      } else {
        if (a.grace > 0) { a.grace -= dt; a.body.x += a.body.v * dt; }
        else a.body.update(dt, ratioFn());
        a.pose = a.landT > 0 ? 'land' : 'auto';
      }
      if (a.landT > 0) a.landT -= dt;
      // ハードル通過判定
      while (a.nextH < HURDLES.length && a.body.x >= HURDLES[a.nextH]) {
        this.crossHurdle(a, a.nextH);
        a.nextH++;
      }
    }
    heightRatio(a) {
      if (!a.air) return 0;
      const f = a.airT / JUMP_T;
      return 4 * f * (1 - f);
    }
    crossHurdle(a, i) {
      const hr = this.heightRatio(a);
      const f = a.airT / JUMP_T;
      const L = this._lastL;
      const sy = L ? L.groundY - a.lane * L.laneGap - L.size * 0.9 : 200;
      if (a.air && hr >= this.thr) {
        const perfect = Math.abs(f - 0.5) < this.perfW;
        a.clearQ = perfect ? 'perfect' : 'good';
        if (a.isPlayer) {
          if (perfect) {
            this.combo++; this.stats.perfect++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            Sound.play('perfect');
            this.fx.text(Engine.W * 0.42, sy, this.combo >= 2 ? `PERFECT ×${this.combo}` : 'PERFECT!', '#ffd84f', 30);
          } else {
            this.combo = 0; this.stats.good++;
            Sound.play('good');
            this.fx.text(Engine.W * 0.42, sy, 'GOOD', '#7fe0ff', 26);
          }
        }
      } else if (a.air && hr >= this.thr * 0.45) {
        // ひっかけ：ハードルを倒して減速
        a.knocked[i] = 1;
        a.body.v *= 0.72;
        a.clearQ = 'hit';
        if (a.isPlayer) {
          this.combo = 0; this.stats.hit++;
          Sound.play('hurdle'); Engine.vibrate(60); this.fx.shake = 6;
          this.fx.text(Engine.W * 0.42, sy, f < 0.5 ? 'はやい！' : 'おそい！', '#ff8a8a', 28);
        }
      } else {
        // 転倒
        a.knocked[i] = 1;
        a.air = false;
        a.fallT = 0.85;
        a.body.v *= 0.35;
        if (a.isPlayer) {
          this.combo = 0; this.stats.fall++;
          Sound.play('hurdle'); Sound.play('fall'); Engine.vibrate(160); this.fx.shake = 12;
          this.fx.text(Engine.W * 0.42, sy, 'ころんだ！', '#ff6b6b', 32);
          this.fx.dust(a.body.x, (L ? L.groundY : 300), 10);
        }
      }
    }
    land(a) {
      a.air = false;
      a.landT = 0.14;
      a.grace = 0.12;
      const target = a.jumpTarget;
      const used = target != null && a.nextH > HURDLES.indexOf(target);
      if (!used) {
        a.body.v *= 0.88;
        if (a.isPlayer) { this.stats.wasted++; this.combo = 0; this.hint('ハードルの手前でジャンプ！', 1.2); }
      } else if (a.clearQ === 'perfect') {
        const bonus = a.isPlayer ? Math.min(0.045, 0.012 * this.combo) : 0.01 * a.skill;
        a.body.v = Math.min(a.body.maxSpeed * 1.03, a.body.v * (1 + bonus));
      } else if (a.clearQ === 'good') {
        a.body.v *= 0.94;
      }
      a.clearQ = null;
      if (a.isPlayer) {
        Sound.play('land');
        const L = this._lastL;
        if (L) this.fx.dust(a.body.x, L.groundY, 5);
      }
    }
    athleteExtra(a) {
      const hr = this.heightRatio(a);
      return { lift: hr * 0.62, shadowLift: hr * 0.5, bellyJiggle: a.landT > 0 ? 1 : 0 };
    }
    draw(ctx, W, H) {
      this._lastL = this.layout(W, H);
      super.draw(ctx, W, H);
    }
    drawLaneObjects(ctx, L, k, y, sc, layer) {
      const a = this.athletes[k];
      const hh = L.size * 0.5 * sc;
      // 踏切ガイド（EASY/NORMAL・自分のレーン）
      if (layer === 'back' && a.isPlayer && this.diff.aid && a.nextH < HURDLES.length && this.state === 'run') {
        const h = HURDLES[a.nextH];
        const v = Math.max(4, a.body.v);
        const span = (x0, x1, col) => {
          const s0 = this.sx(L, x0), s1 = this.sx(L, x1);
          ctx.fillStyle = col; ctx.fillRect(s0, y - L.laneGap * 0.35, s1 - s0, L.laneGap * 0.7);
        };
        const fWin = Math.sqrt(1 - this.thr); // heightRatio >= thr となる f の幅
        span(h - v * JUMP_T * (0.5 + fWin / 2), h - v * JUMP_T * (0.5 - fWin / 2), 'rgba(255,230,80,0.45)');
        span(h - v * JUMP_T * (0.5 + this.perfW), h - v * JUMP_T * (0.5 - this.perfW), 'rgba(60,230,110,0.85)');
      }
      // ハードル（選手より奥 or 手前を判定）
      HURDLES.forEach((hx, i) => {
        const front = a.body.x > hx; // 通過済みは奥側に見える
        if ((layer === 'back') !== front) return;
        const x = this.sx(L, hx);
        if (x < -60 || x > L.W + 60) return;
        ctx.save();
        ctx.translate(x, y);
        if (a.knocked[i]) ctx.rotate(1.25);
        ctx.fillStyle = '#eee'; ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5;
        ctx.fillRect(-3 * sc, -hh, 5 * sc, hh);
        ctx.fillRect(-14 * sc, -2, 24 * sc, 4 * sc);
        const bw = 12 * sc, bh = Math.max(6, hh * 0.22);
        for (let j = 0; j < 3; j++) {
          ctx.fillStyle = j % 2 ? '#111' : '#fff';
          ctx.fillRect(-bw * 1.5 + j * bw, -hh - bh, bw, bh);
        }
        ctx.strokeRect(-bw * 1.5, -hh - bh, bw * 3, bh);
        ctx.restore();
      });
    }
    drawExtraHUD(ctx, L, x, y) {
      if (this.combo >= 2) Draw.text(ctx, `COMBO ×${this.combo}`, x, y + 12, 20, '#ffd84f', 'left', 4);
    }
    extraDetails(d) {
      d.push(`ハードル：PERFECT ${this.stats.perfect} / GOOD ${this.stats.good} / 接触 ${this.stats.hit} / 転倒 ${this.stats.fall}`);
      if (this.maxCombo >= 2) d.push(`最大コンボ：${this.maxCombo}`);
    }
  }

  PPO.registerCompetition('hurdles110', {
    create: (cx) => new Hurdles110(cx),
    howto: `
      <h3>🎯 目標</h3><p>10台のハードルを越えながら110mを駆けぬけよう！</p>
      <h3>🕹 操作</h3>
      <ol>
        <li>「ひだり」「みぎ」を交互にタップして加速</li>
        <li>ハードルが近づいたら<b>「ジャンプ」</b></li>
        <li>着地したら、すぐにまた交互タップ</li>
      </ol>
      <h3>💡 コツ</h3>
      <ul>
        <li>ハードルの真上で一番高くなるタイミングが<b>PERFECT</b></li>
        <li>PERFECTを続けると<b>コンボボーナス</b>で加速！</li>
        <li>早すぎ・遅すぎはハードルに接触して減速、ジャンプしないと転倒</li>
        <li>EASY / NORMAL ではレーンに緑のゾーン（理想の踏切位置）が出る</li>
        <li>スピードが速いほど踏切位置は手前になる</li>
      </ul>`,
  });
})();

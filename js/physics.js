/* 物理・数学ユーティリティ */
(function () {
  'use strict';
  const PPO = (window.PPO = window.PPO || {});

  const U = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (a, b) => a + Math.random() * (b - a),
    randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    // 平均0・標準偏差1の正規乱数
    randn() {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    approach(v, target, maxStep) {
      if (v < target) return Math.min(target, v + maxStep);
      return Math.max(target, v - maxStep);
    },
    easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
    deg: (r) => (r * 180) / Math.PI,
    rad: (d) => (d * Math.PI) / 180,
  };

  /* 走者の運動モデル
     ratio（0〜1：テンポの理想比）から目標速度を決め、加速度制限付きで追従する */
  class RunnerBody {
    constructor(opts) {
      this.maxSpeed = opts.maxSpeed || 11.6;   // m/s
      this.accel = opts.accel || 7.2;          // 低速時の加速度
      this.decel = opts.decel || 3.2;          // タップをやめた時の減速
      this.x = 0;
      this.v = 0;
      this.cap = 1;                            // 疲労などによる速度上限（比率）
    }
    targetFor(ratio) {
      return this.maxSpeed * Math.pow(U.clamp(ratio, 0, 1), 0.9) * this.cap;
    }
    update(dt, ratio) {
      const target = this.targetFor(ratio);
      if (target > this.v) {
        const a = this.accel * (1 - 0.62 * (this.v / this.maxSpeed));
        this.v = Math.min(target, this.v + a * dt);
      } else {
        this.v = Math.max(target, this.v - this.decel * dt);
      }
      this.x += this.v * dt;
    }
  }

  /* 放物運動（空気抵抗なし／ゲーム用重力） */
  class Projectile {
    constructor(x, y, vx, vy, g) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.g = g || 9.8;
      this.t = 0; this.landed = false;
    }
    update(dt) {
      if (this.landed) return;
      this.t += dt;
      this.x += this.vx * dt;
      this.vy -= this.g * dt;
      this.y += this.vy * dt;
      if (this.y <= 0 && this.vy < 0) { this.y = 0; this.landed = true; }
    }
    static range(v, angleRad, g) { return (v * v * Math.sin(2 * angleRad)) / g; }
    static peak(vy, g) { return (vy * vy) / (2 * g); }
  }

  PPO.U = U;
  PPO.RunnerBody = RunnerBody;
  PPO.Projectile = Projectile;
})();

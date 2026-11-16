/* パグのキャラクター定義と描画（すべてCanvasで手描き：画像素材不要） */
(function () {
  'use strict';
  const PPO = (window.PPO = window.PPO || {});

  // 性能差は ±4% 程度に抑え、極端な有利不利を作らない
  const PUGS = {
    fawn: {
      id: 'fawn', name: 'ムギ', breed: 'フォーンパグ', type: 'バランス型', typeColor: '#22b35e',
      desc: 'なんでもそつなくこなす、みんなの人気者。',
      stats: { speed: 1.0, jump: 1.0, power: 1.0, stamina: 1.0, tech: 1.0 },
      col: { fur: '#e9c48c', shade: '#cfa465', mask: '#3a2c25', ear: '#3a2c25', belly: '#f6dfb6', bib: '#1d6fd8' },
      acc: null, lash: false, brow: 0, lid: 0,
    },
    black: {
      id: 'black', name: 'スミ', breed: '黒パグ', type: 'スピード型', typeColor: '#1d6fd8',
      desc: '足の回転がとにかく速い。短距離が得意。',
      stats: { speed: 1.035, jump: 0.985, power: 0.985, stamina: 0.975, tech: 1.0 },
      col: { fur: '#2e2d33', shade: '#1c1b20', mask: '#141317', ear: '#121115', belly: '#45434c', bib: '#ffc21a', hi: '#6d6a78' },
      acc: 'band', accColor: '#ffc21a', lash: false, brow: 1, lid: 0.15,
    },
    white: {
      id: 'white', name: 'ユキ', breed: '白パグ', type: 'ジャンプ型', typeColor: '#a050e0',
      desc: 'ふわっと高く跳ぶ。跳躍種目で輝く。',
      stats: { speed: 0.99, jump: 1.04, power: 0.975, stamina: 0.995, tech: 1.0 },
      col: { fur: '#f8f3ec', shade: '#ddd2c4', mask: '#a8968c', ear: '#bda99e', belly: '#ffffff', bib: '#ec4646' },
      acc: 'ribbon', accColor: '#ff6fa8', lash: true, brow: 0, lid: 0, blush: true,
    },
    silver: {
      id: 'silver', name: 'ギン', breed: 'シルバーパグ', type: 'テクニック型', typeColor: '#607d8b',
      desc: '冷静沈着。タイミング判定が少し広く、スタミナも豊富。',
      stats: { speed: 0.99, jump: 0.995, power: 0.99, stamina: 1.04, tech: 1.12 },
      col: { fur: '#c3c0ba', shade: '#a19e98', mask: '#2d2d30', ear: '#2a2a2d', belly: '#dedbd5', bib: '#22b35e' },
      acc: 'headband', accColor: '#22b35e', lash: false, brow: 0, lid: 0.35,
    },
    apricot: {
      id: 'apricot', name: 'アン', breed: 'アプリコットパグ', type: 'パワー型', typeColor: '#e2502a',
      desc: '力じまんの元気っ子。投てき種目が得意。',
      stats: { speed: 0.99, jump: 0.985, power: 1.045, stamina: 1.0, tech: 0.98 },
      col: { fur: '#eda364', shade: '#cf8346', mask: '#3f2a20', ear: '#3f2a20', belly: '#f8c896', bib: '#7b3fe4' },
      acc: 'hachimaki', accColor: '#ec4646', lash: false, brow: 2, lid: 0,
    },
  };
  const UNLOCK_RULES = {
    white: { text: '金メダルを合計3個とると解放', check: (d) => d.medals.gold >= 3 },
    silver: { text: '大会で優勝すると解放', check: (d) => d.tournament.wins >= 1 },
  };

  const OUT = 'rgba(38,22,18,0.9)';

  function ell(ctx, x, y, rx, ry, rot, fill, stroke, lw) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot || 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw || 0.025; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else {
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
  }

  function leg(ctx, px, py, ang, len, fill, paw) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    rr(ctx, -0.06, -0.02, 0.12, len + 0.02, 0.06);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 0.022; ctx.strokeStyle = OUT; ctx.stroke();
    ell(ctx, 0.02, len, 0.075, 0.045, 0, paw || fill, OUT, 0.02);
    ctx.restore();
  }

  /* drawPug(ctx, x, y, size, opt)
     x,y: 足元の位置 / size: 全高のピクセル数
     opt: { pug, pose, phase, speed(0-1), t, tilt, item, itemAngle, bib, expr, flip, squash, alpha } */
  function drawPug(ctx, x, y, size, opt) {
    const o = opt || {};
    const P = PUGS[o.pug] || PUGS.fawn;
    const c = P.col;
    const pose = o.pose || 'idle';
    const ph = o.phase || 0;
    const sp = o.speed || 0;
    const t = o.t || 0;
    const s = size;

    let bodyBob = 0, bodyTilt = 0, sqx = 1, sqy = 1, headTilt = 0, headDy = 0;
    let fl = 0, ff = 0, bl = 0, bf = 0; // 脚の角度 front-near, front-far, back-near, back-far
    let legLen = 0.2;
    let expr = o.expr || 'normal';
    let tongue = false, sweat = false, tears = false, stars = false;
    const amp = 0.45 + 0.65 * sp;

    switch (pose) {
      case 'idle':
        bodyBob = Math.sin(t * 3) * 0.012;
        fl = 0.05; ff = -0.05; bl = 0.05; bf = -0.05;
        break;
      case 'set':
        bodyTilt = 0.28; bodyBob = 0.06; headDy = 0.02; headTilt = -0.2;
        fl = -0.5; ff = -0.35; bl = 0.9; bf = 0.6; legLen = 0.17;
        expr = 'focus';
        break;
      case 'run':
      case 'sprint':
        fl = Math.sin(ph) * amp - 0.1;
        ff = Math.sin(ph + 0.7) * amp - 0.1;
        bl = Math.sin(ph + Math.PI) * amp + 0.1;
        bf = Math.sin(ph + Math.PI + 0.7) * amp + 0.1;
        bodyBob = Math.abs(Math.sin(ph)) * 0.06 * (0.4 + sp);
        bodyTilt = 0.04 + Math.sin(ph * 2) * 0.03 * sp + sp * 0.06;
        headTilt = Math.sin(ph * 2) * 0.05 * sp;
        if (sp > 0.85) tongue = true;
        if (pose === 'sprint') { expr = expr === 'normal' ? 'focus' : expr; tongue = true; }
        break;
      case 'jump':
        fl = -1.2; ff = -0.95; bl = 1.1; bf = 0.85; bodyTilt = -0.12; headTilt = -0.1;
        expr = 'focus';
        break;
      case 'air':
        fl = -1.45; ff = -1.25; bl = 1.35; bf = 1.15; bodyTilt = (o.bodyTilt != null ? o.bodyTilt : 0);
        expr = o.expr || 'wow';
        break;
      case 'arch':
        fl = 0.6; ff = 0.4; bl = -0.6; bf = -0.4; bodyTilt = -0.2; headTilt = 0.4;
        expr = 'focus';
        break;
      case 'land':
        sqx = 1.18; sqy = 0.8; fl = -0.6; ff = -0.4; bl = 0.6; bf = 0.4; bodyBob = -0.03;
        expr = o.expr || 'wow';
        break;
      case 'belly':
        bodyTilt = 0.15; sqx = 1.2; sqy = 0.78; fl = -1.5; ff = -1.4; bl = 1.5; bf = 1.4; bodyBob = -0.12; legLen = 0.18;
        expr = o.expr || 'dizzy';
        break;
      case 'fall':
        fl = -1.0 + Math.sin(t * 20) * 0.4; ff = 1.2; bl = 1.6; bf = -0.6 + Math.sin(t * 18) * 0.4;
        expr = 'dizzy'; stars = true;
        break;
      case 'tired':
        fl = Math.sin(ph) * amp * 0.7; ff = Math.sin(ph + 0.7) * amp * 0.7;
        bl = Math.sin(ph + Math.PI) * amp * 0.7; bf = Math.sin(ph + Math.PI + 0.7) * amp * 0.7;
        bodyBob = Math.abs(Math.sin(ph)) * 0.04 + 0.02; headDy = 0.04; headTilt = 0.18;
        expr = 'tired'; tongue = true; sweat = true;
        break;
      case 'joy': {
        const j = Math.abs(Math.sin(t * 7));
        bodyBob = -j * 0.18; fl = -2.5 + Math.sin(t * 14) * 0.3; ff = -2.2 + Math.cos(t * 14) * 0.3;
        bl = 0.25; bf = -0.15; bodyTilt = -0.25; headTilt = -0.15;
        expr = 'happy'; tongue = true; stars = !!o.sparkle;
        break;
      }
      case 'sad':
        headDy = 0.06; headTilt = 0.32; bodyBob = 0.02; fl = 0.1; ff = -0.1; bl = 0.1; bf = -0.1;
        expr = 'sad'; tears = true;
        break;
      case 'podium':
        bodyBob = Math.sin(t * 4) * 0.02; fl = -2.3 + Math.sin(t * 6) * 0.35; ff = 0.05; bl = 0.05; bf = -0.05;
        bodyTilt = -0.12; expr = 'happy'; tongue = true;
        break;
      case 'throw':
        fl = -1.5; ff = 0.3; bl = 0.7; bf = -0.3; bodyTilt = -0.25; headTilt = -0.2;
        expr = 'focus';
        break;
      case 'windup':
        fl = 0.4; ff = -0.2; bl = Math.sin(ph) * 0.5; bf = Math.sin(ph + Math.PI) * 0.5; bodyTilt = 0.12;
        expr = 'focus';
        break;
      default: break;
    }
    if (o.expr && pose !== 'set' && pose !== 'fall' && pose !== 'joy') expr = o.expr;
    if (o.sweat) sweat = true;
    if (o.tongue) tongue = true;
    if (o.squash) { sqx *= 1 + o.squash * 0.25; sqy *= 1 - o.squash * 0.25; }

    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.translate(x, y);
    ctx.scale(s * (o.flip ? -1 : 1), s);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // 影
    ell(ctx, 0, 0, 0.42 * (1 - Math.min(0.5, (o.shadowLift || 0))), 0.06, 0, 'rgba(0,0,0,0.22)');

    const lift = (o.lift || 0);
    ctx.translate(0, -lift);
    ctx.translate(0, -0.34 - bodyBob + 0.34);
    ctx.translate(0, -0.34);
    ctx.rotate(bodyTilt + (o.tilt || 0));
    ctx.scale(sqx, sqy);
    ctx.translate(0, 0.34);

    const hipY = -0.26, shoulderY = -0.28;
    // 奥の脚
    leg(ctx, 0.2, shoulderY, ff, legLen, c.shade, c.shade);
    leg(ctx, -0.22, hipY, bf, legLen, c.shade, c.shade);

    // しっぽ（くるん）
    ctx.save();
    ctx.translate(-0.38, -0.47);
    ctx.rotate(Math.sin(t * 9 + ph) * 0.15);
    ctx.beginPath();
    ctx.arc(0, 0, 0.075, 0.2, Math.PI * 1.9);
    ctx.lineWidth = 0.075; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.lineWidth = 0.045; ctx.strokeStyle = c.fur; ctx.stroke();
    ctx.restore();

    // 胴体
    ell(ctx, 0, -0.36, 0.38, 0.22, 0, c.fur, OUT);
    ell(ctx, 0.04, -0.27, 0.26, 0.1, 0, c.belly);
    // お腹のゆれ
    if (o.bellyJiggle) ell(ctx, 0.05, -0.2 + Math.sin(t * 30) * 0.015 * o.bellyJiggle, 0.2, 0.06, 0, c.belly);

    // ゼッケン
    if (o.bib !== false) {
      ctx.save();
      ctx.translate(-0.04, -0.4);
      ctx.rotate(-0.04);
      rr(ctx, -0.12, -0.08, 0.24, 0.16, 0.03);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 0.015; ctx.strokeStyle = c.bib; ctx.stroke();
      ctx.fillStyle = c.bib;
      ctx.scale(0.01, 0.01);
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(o.number != null ? o.number : 1), 0, 1);
      ctx.restore();
    }

    // 手前の脚
    leg(ctx, -0.18, hipY, bl, legLen, c.fur);
    leg(ctx, 0.24, shoulderY, fl, legLen, c.fur);

    // バトン
    if (o.item === 'baton') {
      ctx.save();
      ctx.translate(0.24, shoulderY);
      ctx.rotate(fl);
      ctx.translate(0.03, legLen);
      ctx.rotate(-fl + 0.3);
      rr(ctx, -0.035, -0.16, 0.07, 0.3, 0.03);
      ctx.fillStyle = '#ffcc00'; ctx.fill(); ctx.lineWidth = 0.018; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.restore();
    }

    // ---- 頭 ----
    ctx.save();
    ctx.translate(0.32, -0.62 + headDy);
    ctx.rotate(headTilt);
    const cheek = Math.sin(ph * 2) * 0.018 * sp + (pose === 'land' ? 0.02 : 0);
    const earFlap = Math.sin(ph + 1.2) * 0.5 * sp + (pose === 'air' || pose === 'jump' ? -0.6 : 0) + (pose === 'joy' ? Math.sin(t * 14) * 0.5 : 0);

    // 奥の耳
    ctx.save();
    ctx.translate(-0.1, -0.2);
    ctx.rotate(-0.5 + earFlap * 0.6);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-0.13, 0.02, -0.1, 0.13); ctx.quadraticCurveTo(-0.02, 0.08, 0.05, 0.03); ctx.closePath();
    ctx.fillStyle = c.ear; ctx.fill(); ctx.lineWidth = 0.02; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.restore();

    // 頭部
    ell(ctx, 0, 0, 0.27, 0.25, 0, c.fur, OUT);
    // ほっぺ（垂れ）
    ell(ctx, 0.1, 0.12 + cheek, 0.17, 0.11, 0.2, c.fur);
    // マスク（黒い顔）
    ell(ctx, 0.14, 0.06 + cheek * 0.5, 0.15, 0.13, 0.1, c.mask);
    // しわ
    ctx.strokeStyle = P.id === 'black' ? (c.hi || '#555') : 'rgba(70,45,30,0.55)';
    ctx.lineWidth = 0.018;
    ctx.beginPath(); ctx.arc(0.08, -0.06, 0.09, Math.PI * 1.15, Math.PI * 1.75); ctx.stroke();
    ctx.beginPath(); ctx.arc(0.1, -0.03, 0.06, Math.PI * 1.2, Math.PI * 1.7); ctx.stroke();
    // 鼻
    ell(ctx, 0.25, 0.03 + cheek * 0.4, 0.045, 0.032, 0, '#0b0a0c');
    ell(ctx, 0.24, 0.022, 0.012, 0.008, 0, 'rgba(255,255,255,0.5)');
    // 口
    ctx.strokeStyle = '#0b0a0c'; ctx.lineWidth = 0.018;
    ctx.beginPath();
    if (expr === 'sad' || expr === 'tired') { ctx.arc(0.19, 0.17, 0.05, Math.PI * 1.15, Math.PI * 1.85); }
    else if (expr === 'happy') { ctx.arc(0.18, 0.1, 0.07, 0.2, Math.PI - 0.4); }
    else if (P.brow === 2) { ctx.arc(0.18, 0.11, 0.06, 0.3, Math.PI - 0.6); }
    else { ctx.moveTo(0.12, 0.13); ctx.quadraticCurveTo(0.18, 0.16, 0.24, 0.12); }
    ctx.stroke();
    // 舌
    if (tongue || expr === 'happy') {
      const tl = 0.06 + (pose === 'tired' ? Math.sin(t * 8) * 0.02 + 0.03 : 0);
      rr(ctx, 0.13, 0.13, 0.07, tl + 0.03, 0.035);
      ctx.fillStyle = '#ff7a9a'; ctx.fill(); ctx.lineWidth = 0.014; ctx.strokeStyle = '#a3304d'; ctx.stroke();
    }
    // ほお紅
    if (P.blush || expr === 'happy') ell(ctx, -0.02, 0.09, 0.05, 0.03, 0, 'rgba(255,120,150,0.45)');

    // 目
    const eye = (ex, ey, r) => {
      if (expr === 'happy') {
        ctx.strokeStyle = '#120e10'; ctx.lineWidth = 0.028;
        ctx.beginPath(); ctx.arc(ex, ey + 0.02, r * 0.8, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
        return;
      }
      if (expr === 'dizzy') {
        ctx.strokeStyle = '#120e10'; ctx.lineWidth = 0.024;
        ctx.beginPath(); ctx.moveTo(ex - r * 0.7, ey - r * 0.7); ctx.lineTo(ex + r * 0.7, ey + r * 0.7);
        ctx.moveTo(ex + r * 0.7, ey - r * 0.7); ctx.lineTo(ex - r * 0.7, ey + r * 0.7); ctx.stroke();
        return;
      }
      ell(ctx, ex, ey, r, r, 0, '#fff', OUT, 0.016);
      const look = expr === 'focus' ? 0.35 : 0.2;
      ell(ctx, ex + r * look, ey + r * 0.05, r * 0.68, r * 0.72, 0, '#1a1214');
      ell(ctx, ex + r * look + r * 0.25, ey - r * 0.25, r * 0.22, r * 0.22, 0, '#fff');
      ell(ctx, ex + r * look - r * 0.2, ey + r * 0.28, r * 0.1, r * 0.1, 0, 'rgba(255,255,255,0.8)');
      // まぶた（表情）
      let lid = P.lid || 0;
      if (expr === 'tired') lid = 0.5;
      if (expr === 'sad') lid = 0.3;
      if (expr === 'focus') lid = Math.max(lid, 0.2);
      if (lid > 0) {
        ctx.save();
        ctx.beginPath(); ctx.arc(ex, ey, r * 1.02, 0, Math.PI * 2); ctx.clip();
        ctx.fillStyle = c.mask === '#141317' ? '#2a292f' : c.fur;
        ctx.fillRect(ex - r * 1.1, ey - r * 1.1, r * 2.2, r * 2.2 * lid);
        ctx.restore();
      }
      if (P.lash) {
        ctx.strokeStyle = '#120e10'; ctx.lineWidth = 0.014;
        ctx.beginPath(); ctx.moveTo(ex + r * 0.6, ey - r * 0.75); ctx.lineTo(ex + r * 1.0, ey - r * 1.05); ctx.stroke();
      }
    };
    eye(0.2, -0.06, 0.055);   // 奥の目
    eye(0.06, -0.05, 0.075);  // 手前の目
    // 眉
    ctx.strokeStyle = c.mask === '#141317' ? '#8d8a96' : '#3a2a22'; ctx.lineWidth = 0.022;
    ctx.beginPath();
    if (expr === 'sad' || expr === 'tired') { ctx.moveTo(0.0, -0.15); ctx.lineTo(0.1, -0.18); }
    else if (expr === 'focus' || P.brow === 1) { ctx.moveTo(0.0, -0.19); ctx.lineTo(0.11, -0.15); }
    else if (P.brow === 2) { ctx.moveTo(-0.01, -0.18); ctx.lineTo(0.11, -0.16); }
    else { ctx.moveTo(0.0, -0.17); ctx.quadraticCurveTo(0.06, -0.2, 0.11, -0.17); }
    ctx.stroke();
    // 涙
    if (tears) {
      const ty = ((t * 1.5) % 1) * 0.18;
      ell(ctx, 0.03, 0.04 + ty, 0.022, 0.035, 0, 'rgba(110,190,255,0.9)');
    }

    // 手前の耳
    ctx.save();
    ctx.translate(0.0, -0.22);
    ctx.rotate(-0.25 + earFlap);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-0.14, 0.0, -0.12, 0.14); ctx.quadraticCurveTo(-0.02, 0.1, 0.06, 0.02); ctx.closePath();
    ctx.fillStyle = c.ear; ctx.fill(); ctx.lineWidth = 0.02; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.restore();

    // アクセサリー
    if (P.acc === 'band' || P.acc === 'headband' || P.acc === 'hachimaki') {
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, 0, 0.275, 0.255, 0, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = P.accColor;
      ctx.beginPath();
      ctx.moveTo(-0.3, -0.18); ctx.quadraticCurveTo(0, -0.23, 0.3, -0.12);
      ctx.lineTo(0.3, -0.06); ctx.quadraticCurveTo(0, -0.17, -0.3, -0.11); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (P.acc === 'hachimaki') {
        ctx.fillStyle = P.accColor;
        const w = Math.sin(t * 12 + ph) * 0.05 * (0.3 + sp);
        ctx.beginPath(); ctx.moveTo(-0.25, -0.15); ctx.lineTo(-0.45, -0.2 + w); ctx.lineTo(-0.43, -0.12 + w); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-0.25, -0.13); ctx.lineTo(-0.42, -0.05 - w); ctx.lineTo(-0.38, 0.0 - w); ctx.closePath(); ctx.fill();
      }
    } else if (P.acc === 'ribbon') {
      ctx.save();
      ctx.translate(-0.12, -0.21);
      ctx.fillStyle = P.accColor; ctx.strokeStyle = OUT; ctx.lineWidth = 0.014;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-0.09, -0.06); ctx.lineTo(-0.09, 0.06); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.09, -0.06); ctx.lineTo(0.09, 0.06); ctx.closePath(); ctx.fill(); ctx.stroke();
      ell(ctx, 0, 0, 0.025, 0.025, 0, P.accColor, OUT, 0.014);
      ctx.restore();
    }

    // 汗
    if (sweat) {
      const k = (t * 2) % 1;
      ctx.globalAlpha *= 1 - k;
      ell(ctx, -0.2, -0.15 + k * 0.15, 0.03, 0.045, 0, '#7cc8ff');
      ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
    }
    ctx.restore(); // 頭

    // やり
    if (o.item === 'javelin') {
      ctx.save();
      ctx.translate(0.18, -0.6);
      ctx.rotate(o.itemAngle || -0.4);
      ctx.strokeStyle = OUT; ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.moveTo(-0.8, 0); ctx.lineTo(0.9, 0); ctx.stroke();
      ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 0.035;
      ctx.beginPath(); ctx.moveTo(-0.8, 0); ctx.lineTo(0.9, 0); ctx.stroke();
      ctx.strokeStyle = '#ec4646'; ctx.lineWidth = 0.045;
      ctx.beginPath(); ctx.moveTo(-0.05, 0); ctx.lineTo(0.15, 0); ctx.stroke();
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.moveTo(0.9, -0.025); ctx.lineTo(1.02, 0); ctx.lineTo(0.9, 0.025); ctx.fill();
      ctx.restore();
    }

    ctx.restore(); // 全体

    // ピヨピヨ星・キラキラ（回転の影響を受けない位置に）
    if (stars) {
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + (i * Math.PI * 2) / 3;
        const sx = x + Math.cos(a) * s * 0.28 + s * 0.2;
        const sy = y - s * 1.0 + Math.sin(a) * s * 0.07 - lift * s;
        drawStar(ctx, sx, sy, s * 0.06, pose === 'joy' ? '#fff27a' : '#ffd400');
      }
      ctx.restore();
    }
  }

  function drawStar(ctx, x, y, r, col) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rr2 = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2);
    }
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.15); ctx.strokeStyle = 'rgba(80,50,0,0.6)'; ctx.stroke();
  }

  // UI用：小さなキャンバスにパグを描く
  function renderPugCanvas(canvas, pugId, pose, t) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const size = Math.min(h * 0.82, w * 0.7);
    drawPug(ctx, w * 0.42, h * 0.92, size, { pug: pugId, pose: pose || 'idle', t: t || 0, bib: false, phase: (t || 0) * 12, speed: 0.6 });
  }

  // 観客・審判などの犬の頭
  const CROWD_COLORS = [
    ['#e9c48c', '#3a2c25'], ['#2e2d33', '#141317'], ['#f8f3ec', '#a8968c'], ['#c3c0ba', '#2d2d30'],
    ['#eda364', '#3f2a20'], ['#b07a4a', '#5a3a22'], ['#fff', '#d9c2a0'], ['#8a6a50', '#3a2a20'],
  ];
  function drawCrowdDog(ctx, x, y, r, colIdx, mouthOpen, shirt) {
    const [fur, mask] = CROWD_COLORS[colIdx % CROWD_COLORS.length];
    if (shirt) { ctx.fillStyle = shirt; ctx.fillRect(x - r * 0.9, y + r * 0.6, r * 1.8, r * 1.2); }
    ctx.fillStyle = mask;
    ctx.beginPath(); ctx.ellipse(x - r * 0.75, y - r * 0.55, r * 0.4, r * 0.3, -0.6, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + r * 0.75, y - r * 0.55, r * 0.4, r * 0.3, 0.6, 0, 7); ctx.fill();
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.fillStyle = mask;
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.3, r * 0.55, r * 0.45, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(x - r * 0.38, y - r * 0.15, r * 0.17, 0, 7); ctx.arc(x + r * 0.38, y - r * 0.15, r * 0.17, 0, 7); ctx.fill();
    if (mouthOpen) { ctx.fillStyle = '#ff7a9a'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.62, r * 0.18, r * 0.2, 0, 0, 7); ctx.fill(); }
  }

  PPO.PUGS = PUGS;
  PPO.UNLOCK_RULES = UNLOCK_RULES;
  PPO.drawPug = drawPug;
  PPO.drawStar = drawStar;
  PPO.drawCrowdDog = drawCrowdDog;
  PPO.renderPugCanvas = renderPugCanvas;
  PPO.roundRect = rr;
})();

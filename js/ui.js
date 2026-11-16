/* 画面UI：タイトル・選手選択・競技選択・説明・結果・大会・記録室・オプション */
(function () {
  'use strict';
  const PPO = window.PPO;
  const Save = PPO.Save, Score = PPO.Score, Sound = PPO.Sound, Engine = PPO.Engine, Input = PPO.Input, Tour = PPO.Tournament;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function mkPug(pug, w, h, pose) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.style.width = w + 'px'; c.style.height = h + 'px';
    PPO.renderPugCanvas(c, pug, pose || 'idle', 0.4);
    return c;
  }

  const UI = {
    current: null,
    stack: [],
    menuScene: null,
    flow: 'single',       // 'single' | 'tournament'
    eventId: null,
    afterSelect: null,

    init() {
      this.menuScene = new PPO.MenuScene();
      Engine.setScene(this.menuScene);
      // ナビゲーション
      document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => this.nav(b.dataset.nav)));
      document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { Sound.play('back'); this.back(); }));
      document.addEventListener('pointerdown', () => {
        Sound.unlock();
        if (!Sound.current && !document.body.classList.contains('playing') && this.current !== 'result') Sound.playBGM('title');
      }, { capture: true });
      document.addEventListener('click', (e) => { if (e.target.closest('.btn, .event-card, .pug-card, .choice')) Sound.play('tap'); }, { capture: true });
      $('btnSelectOk').addEventListener('click', () => this.confirmSelect());
      $('btnHowtoStart').addEventListener('click', () => this.startEvent());
      $('btnPause').addEventListener('pointerdown', (e) => { e.preventDefault(); this.pause(); });
      $('btnResumeTournament').addEventListener('click', () => {
        if (Tour.resume()) { this.flow = 'tournament'; this.tourHub(); }
        else { this.toast('大会データを復元できませんでした'); this.refreshTitle(); }
      });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.current === 'play' && !Engine.paused && Engine.scene && Engine.scene.eventId) this.pause(); });
      this.show('title', false);
    },

    // ---------- 画面遷移 ----------
    show(name, push) {
      if (push !== false && this.current && this.current !== name && this.current !== 'play') this.stack.push(this.current);
      document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
      $('screen-' + name).classList.add('active');
      this.current = name;
      const playing = name === 'play';
      document.body.classList.toggle('playing', playing);
      if (!playing) {
        Input.enabled = false;
        Input.setControls([]);
        if (!['result'].includes(name) && Engine.scene !== this.menuScene) Engine.setScene(this.menuScene);
        if (['title', 'select', 'events', 'howto', 'records', 'options', 'tournament'].includes(name) && Sound.current !== 'title' && Sound.ctx && Sound.ctx.state === 'running') Sound.playBGM('title');
      }
      if (name === 'title') { this.stack = []; this.refreshTitle(); }
      const sc = $('screen-' + name).querySelector('.scroll');
      if (sc) sc.scrollTop = 0;
      if (name === 'select') this.animSelect();
    },
    back() {
      const prev = this.stack.pop();
      this.show(prev || 'title', false);
    },
    nav(where) {
      if (where === 'single') { this.flow = 'single'; this.renderEvents(); this.show('events'); }
      else if (where === 'tournament-entry') this.tourEntry();
      else if (where === 'records') { this.renderRecords(); this.show('records'); }
      else if (where === 'options') { this.renderOptions(); this.show('options'); }
    },
    refreshTitle() {
      $('btnResumeTournament').classList.toggle('hidden', !Tour.hasSaved());
    },

    // ---------- 選手選択 ----------
    openSelect(after) {
      this.afterSelect = after;
      this.pendingPug = Save.data.selectedPug;
      this.renderSelect();
      this.show('select');
    },
    renderSelect() {
      const box = $('pugList');
      box.innerHTML = '';
      Object.values(PPO.PUGS).forEach((p) => {
        const unlocked = Save.data.unlocked.includes(p.id);
        const card = document.createElement('div');
        card.className = 'pug-card' + (p.id === this.pendingPug ? ' sel' : '') + (unlocked ? '' : ' locked');
        const statRow = (k, n) => `<div class="stat"><span>${n}</span><i><b style="width:${Math.round(((p.stats[k] - 0.9) / 0.2) * 100)}%"></b></i></div>`;
        card.innerHTML = `<div class="pug-name">${p.name}</div><div class="pug-breed">${p.breed}</div>
          <span class="pug-type" style="background:${p.typeColor}">${p.type}</span>
          ${unlocked ? `<div class="stats">${statRow('speed', 'スピード')}${statRow('jump', 'ジャンプ')}${statRow('power', 'パワー')}${statRow('stamina', 'スタミナ')}${statRow('tech', 'テクニック')}</div>`
          : `<div class="lock-note">🔒 ${PPO.UNLOCK_RULES[p.id].text}</div>`}`;
        const cv = mkPug(p.id, 150, 118, 'idle');
        cv.style.width = '100%';
        card.insertBefore(cv, card.firstChild);
        card.addEventListener('click', () => {
          if (!unlocked) { this.toast('🔒 ' + PPO.UNLOCK_RULES[p.id].text); return; }
          this.pendingPug = p.id;
          Sound.play('bark', { double: false });
          box.querySelectorAll('.pug-card').forEach((c) => c.classList.remove('sel'));
          card.classList.add('sel');
        });
        card.dataset.pug = p.id;
        box.appendChild(card);
      });
    },
    animSelect() {
      const loop = (ts) => {
        if (this.current !== 'select') return;
        const card = $('pugList').querySelector('.pug-card.sel canvas');
        if (card) PPO.renderPugCanvas(card, this.pendingPug, 'joy', ts / 1000);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    },
    confirmSelect() {
      Save.data.selectedPug = this.pendingPug;
      Save.save();
      Sound.play('select');
      const f = this.afterSelect; this.afterSelect = null;
      this.back();
      if (f) f();
    },

    // ---------- 競技選択 ----------
    renderEvents() {
      const bar = $('curPugBar');
      const p = PPO.PUGS[Save.data.selectedPug];
      bar.innerHTML = `<div><div>${p.name}（${p.breed}）</div><div style="font-size:13px;opacity:.85">${p.type} ／ 難易度 ${Score.DIFF[Save.data.difficulty].name}</div></div><button class="btn btn-mid btn-white chg">変更</button>`;
      bar.insertBefore(mkPug(p.id, 64, 50), bar.firstChild);
      bar.querySelector('.chg').addEventListener('click', () => this.openSelect(() => this.renderEvents()));
      const list = $('eventList');
      list.innerHTML = '';
      Score.ORDER.forEach((id) => {
        const e = Score.EVENTS[id];
        const rec = Save.data.records[id];
        const b = document.createElement('button');
        b.className = 'event-card';
        b.innerHTML = `<div class="ev-icon" style="background:${e.color}">${e.icon}</div><div><div class="ev-name">${e.name}</div>
          <div class="ev-pb">自己ベスト：${Score.fmtU(id, rec.best)}</div></div>`;
        b.addEventListener('click', () => { this.flow = 'single'; this.openHowto(id); });
        list.appendChild(b);
      });
    },

    // ---------- 説明 ----------
    openHowto(eventId) {
      this.eventId = eventId;
      const e = Score.EVENTS[eventId];
      const def = PPO.Competitions[eventId];
      const wr = Score.worldRecord(eventId);
      const pb = Save.data.records[eventId].best;
      let head = '';
      if (this.flow === 'tournament') {
        const c = Tour.cur;
        head = `<p class="chip gold">🏆 ${c.stage === 'qualify' ? '予選（' + Tour.QUALIFY_PASS + '位以内で決勝へ）' : '決勝 第' + (c.index + 1) + '競技 / 全' + Tour.events().length + '競技'}</p>`;
      }
      $('howtoTitle').textContent = e.icon + ' ' + e.name;
      $('howtoBody').innerHTML = head + def.howto + `
        <div class="rec-row">
          <span class="chip">🌏 パグ世界記録 ${Score.fmtU(eventId, wr.value)}${wr.holder === 'あなた' ? '（あなた）' : ''}</span>
          <span class="chip gold">⭐ 自己ベスト ${Score.fmtU(eventId, pb)}</span>
          <span class="chip">難易度 ${Score.DIFF[this.flow === 'tournament' ? Tour.cur.difficulty : Save.data.difficulty].name}</span>
        </div>
        <div class="keyhint">PCキーボード：← → / Z X で走る、Space / ↑ でアクション</div>`;
      this.show('howto');
    },

    // ---------- 競技開始 ----------
    startEvent() {
      const id = this.eventId;
      const tour = this.flow === 'tournament';
      const pug = tour ? Tour.cur.pug : Save.data.selectedPug;
      const difficulty = tour ? Tour.cur.difficulty : Save.data.difficulty;
      const cpus = tour ? Tour.cpusForCurrent() : Score.makeCPUs(difficulty, pug, 5);
      const entry = tour ? Tour.cur.player : Score.playerEntry(pug);
      const comp = PPO.Competitions[id].create({
        entry, cpus, difficulty, mode: this.flow,
        onFinish: (res) => setTimeout(() => this.showResult(res, { pug, difficulty }), 250),
      });
      this.show('play');
      $('playOverlay').classList.add('hidden');
      $('btnPause').classList.remove('hidden');
      Input.setControls(comp.controls());
      Input.handler = (a, ph, t) => { if (!Engine.paused && Engine.scene && Engine.scene.onInput) Engine.scene.onInput(a, ph, t); };
      Input.enabled = true;
      Engine.setScene(comp);
      requestAnimationFrame(() => Engine.resize());
    },

    pause() {
      if (this.current !== 'play' || Engine.paused) return;
      Engine.paused = true;
      Input.releaseAll();
      Sound.play('back');
      const ov = $('playOverlay');
      const tour = this.flow === 'tournament' && Engine.scene && Engine.scene.eventId;
      ov.innerHTML = `<div class="pause-box"><h3>一時停止</h3>
        <button class="btn btn-big btn-gold" id="pResume">つづける</button>
        ${tour ? '' : '<button class="btn btn-mid btn-blue" id="pRetry">やりなおす</button>'}
        <button class="btn btn-mid btn-white" id="pQuit">${tour ? '大会を中断してタイトルへ' : '競技をやめる'}</button></div>`;
      ov.classList.remove('hidden');
      $('pResume').onclick = () => { ov.classList.add('hidden'); Engine.paused = false; Engine.last = performance.now(); };
      if ($('pRetry')) $('pRetry').onclick = () => { ov.classList.add('hidden'); this.startEvent(); };
      $('pQuit').onclick = () => {
        ov.classList.add('hidden');
        Engine.paused = false;
        Sound.stopBGM();
        if (tour) { this.toast('大会は「大会のつづきから」で再開できます'); this.show('title', false); }
        else if (Engine.scene instanceof PPO.CeremonyScene) this.show('title', false);
        else { this.renderEvents(); this.stack = ['title']; this.show('events', false); }
      };
    },

    // ---------- 結果 ----------
    showResult(res, ctx) {
      if (this.current !== 'play') return;
      const id = res.eventId;
      const tour = this.flow === 'tournament';
      const qualify = tour && Tour.cur.stage === 'qualify';
      const ranked = Score.rank(id, res.standings);
      const me = ranked.find((r) => r.isPlayer);
      const value = res.dq ? null : res.value;
      const commit = Score.commitResult(id, value, ctx.pug, me.rank, { noMedal: qualify || value == null });
      let tourInfo = null;
      if (tour) tourInfo = Tour.applyResult(id, ranked);

      const pose = value == null ? 'sad' : (me.rank === 1 || commit.pb) ? 'joy' : me.rank >= 4 ? 'sad' : 'idle';
      Engine.setScene(new PPO.ResultScene({ pug: ctx.pug, pose, fireworks: commit.wr || (me.rank === 1 && !qualify), theme: 'day' }));
      Sound.stopBGM();
      if (commit.wr) { Sound.play('record'); setTimeout(() => Sound.play('fanfare'), 900); Engine.fx.burstConfetti(Engine.W, 160); }
      else if (commit.pb && !commit.firstRecord) { Sound.play('record'); Engine.fx.burstConfetti(Engine.W, 90); }
      else if (me.rank === 1 && value != null) { Sound.play('goal'); Engine.fx.burstConfetti(Engine.W, 70); }
      else if (value == null || me.rank >= 4) Sound.play('sad');
      if (value != null && me.rank === 1) setTimeout(() => Sound.play('bark'), 400);

      const e = Score.EVENTS[id];
      $('resultTitle').textContent = `${e.icon} ${e.name}${qualify ? '（予選）' : tour ? '（決勝）' : ''}`;
      const badges = [];
      if (commit.wr) badges.push('<span class="badge wr">🌏 パグ世界記録 更新!!</span>');
      if (commit.pb) badges.push(commit.firstRecord ? '<span class="badge pb">はじめての記録！</span>' : '<span class="badge pb">⭐ 自己ベスト更新！</span>');
      if (commit.medal) badges.push(`<span class="badge medal-${['gold', 'silver', 'bronze'].indexOf(commit.medal) + 1}">${{ gold: '🥇 金メダル', silver: '🥈 銀メダル', bronze: '🥉 銅メダル' }[commit.medal]}</span>`);
      if (qualify) badges.push(tourInfo.qualified ? '<span class="badge pb">🎉 決勝進出！</span>' : '<span class="badge">予選敗退…</span>');
      const valStr = value == null ? (res.reason || '記録なし') : `${Score.fmt(id, value)}<small>${e.unit}</small>`;
      const prev = commit.prevBest != null && commit.pb && !commit.firstRecord ? `（前回のベスト ${Score.fmtU(id, commit.prevBest)}）` : '';
      const wr = Score.worldRecord(id);
      const rows = ranked.map((r) => `<tr class="${r.isPlayer ? 'me' : ''}"><td class="rk">${r.value == null || r.dq ? '—' : r.rank}</td>
        <td><span class="pugslot" data-pug="${r.pug}"></span></td>
        <td>${esc(r.isPlayer ? (id === 'relay' ? 'チームあなた' : 'あなた') : r.name)}<span class="lv">${esc(r.levelName || '')}</span></td>
        <td class="val">${r.dq ? '失格' : r.value == null ? '記録なし' : Score.fmt(id, r.value) + (e.unit === '秒' ? '秒' : 'm')}</td>
        ${tour && !qualify ? `<td class="pts">+${r.points}pt</td>` : ''}</tr>`).join('');
      $('resultBody').innerHTML = `
        <div style="height:24vh"></div>
        <div class="res-hero">
          <div class="res-value">${valStr}</div>
          <div class="res-sub">${value == null ? '' : `${ranked.length}${id === 'relay' ? 'チーム' : '人'}中 ${me.rank}位`} ${prev}</div>
          <div class="badge-row">${badges.join('')}</div>
        </div>
        <div class="card"><h3>順位</h3><table class="rank-table">${rows}</table></div>
        <div class="card"><h3>ふりかえり</h3><ul class="notes">${(res.details || []).map((d) => `<li>${esc(d)}</li>`).join('')}
          <li>パグ世界記録：${Score.fmtU(id, wr.value)}${wr.holder === 'あなた' ? '（あなたの記録！）' : ''}</li>
          <li>自己ベスト：${Score.fmtU(id, Save.data.records[id].best)}</li></ul></div>`;
      $('resultBody').querySelectorAll('.pugslot').forEach((s) => { const c = mkPug(s.dataset.pug, 44, 34); c.className = 'mini-pug'; s.replaceWith(c); });

      const foot = $('resultFoot');
      foot.innerHTML = '';
      const btn = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn btn-mid ' + cls; b.textContent = label; b.addEventListener('click', fn); foot.appendChild(b); };
      if (tour) {
        if (qualify && !tourInfo.qualified) {
          btn('タイトルへ', 'btn-white', () => this.show('title', false));
          btn('もう一度大会に挑戦', 'btn-gold', () => this.tourEntry());
        } else if (Tour.cur.stage === 'ceremony') {
          btn('表彰式へ！', 'btn-gold', () => this.ceremony());
        } else {
          btn('次へ ▶', 'btn-gold', () => this.tourHub());
        }
      } else {
        btn('競技選択', 'btn-white', () => { this.renderEvents(); this.stack = ['title']; this.show('events', false); });
        btn('もう一度！', 'btn-gold', () => this.startEvent());
      }
      this.show('result', false);
      if (commit.unlocked.length) setTimeout(() => this.announceUnlock(commit.unlocked), 900);
      if (Save.loadWarning) { this.toast(Save.loadWarning); Save.loadWarning = null; }
    },
    announceUnlock(ids) {
      ids.forEach((id) => {
        const p = PPO.PUGS[id];
        this.alert(`🎉 新しい選手が仲間になった！\n\n${p.name}（${p.breed}・${p.type}）\n選手選択で選べるようになりました。`);
      });
    },

    // ---------- 大会 ----------
    tourEntry() {
      this.flow = 'tournament';
      this.tourMode = this.tourMode || 'short';
      const render = () => {
        const p = PPO.PUGS[Save.data.selectedPug];
        $('tourTitle').textContent = '大会エントリー';
        $('btnTourBack').classList.remove('hidden');
        const steps = ['選手登録', '予選', '決勝', '表彰式'].map((s, i) => `<span class="${i === 0 ? 'on' : ''}">${s}</span>`).join('');
        $('tourBody').innerHTML = `<div class="tour-steps">${steps}</div>
          <div class="card"><h3>選手</h3><div class="cur-pug" style="background:#f3ead8;color:#2a2140" id="tourPug"><div><div>${p.name}（${p.breed}）</div><div style="font-size:13px">${p.type}</div></div><button class="btn btn-mid btn-blue chg">変更</button></div></div>
          <div class="card"><h3>大会の種類</h3><div class="choice-grid">
            ${Object.entries(Tour.MODES).map(([k, m]) => `<button class="choice ${k === this.tourMode ? 'sel' : ''}" data-mode="${k}"><b>${m.name}</b><span>${m.desc}<br>${m.events.map((e) => Score.EVENTS[e].short).join('・')}</span></button>`).join('')}
          </div></div>
          <div class="card"><h3>ルール</h3><ul class="notes">
            <li>予選：100m走で6人中${Tour.QUALIFY_PASS}位以内なら決勝へ</li>
            <li>決勝：各競技の順位でポイント（1位10pt・2位8pt・3位6pt…）</li>
            <li>合計ポイントで総合順位が決まり、表彰式へ！</li>
            <li>難易度：${Score.DIFF[Save.data.difficulty].name}（オプションで変更）</li></ul></div>`;
        $('tourBody').querySelector('#tourPug').insertBefore(mkPug(p.id, 64, 50), $('tourBody').querySelector('#tourPug').firstChild);
        $('tourBody').querySelector('.chg').addEventListener('click', () => this.openSelect(render));
        $('tourBody').querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { this.tourMode = b.dataset.mode; render(); }));
        const foot = $('tourFoot');
        foot.innerHTML = '<button class="btn btn-big btn-gold" id="btnEntry">エントリー！</button>';
        $('btnEntry').addEventListener('click', async () => {
          if (Tour.hasSaved()) {
            const ok = await this.confirm('中断中の大会があります。\n新しい大会を始めると、中断中の大会は終了します。', '新しく始める', 'やめる');
            if (!ok) return;
            if (Tour.resume()) Tour.abandon();
          }
          Tour.create(this.tourMode, Save.data.selectedPug, Save.data.difficulty);
          Sound.play('fanfare');
          this.tourHub();
        });
      };
      render();
      this.show('tournament');
    },
    tourHub() {
      this.flow = 'tournament';
      const c = Tour.cur;
      const evs = Tour.events();
      $('btnTourBack').classList.add('hidden');
      const steps = ['選手登録', '予選', '決勝', '表彰式'].map((s, i) => {
        const cur = c.stage === 'qualify' ? 1 : c.stage === 'final' ? 2 : 3;
        return `<span class="${i < cur ? 'done' : i === cur ? 'on' : ''}">${s}</span>`;
      }).join('');
      const nextId = Tour.currentEvent();
      const ne = Score.EVENTS[nextId];
      let body = `<div class="tour-steps">${steps}</div>`;
      if (c.stage === 'qualify') {
        $('tourTitle').textContent = '予選';
        body += `<div class="card"><h3>予選：${ne.icon} ${ne.name}</h3><p class="notes">6人で走り、<b>${Tour.QUALIFY_PASS}位以内</b>に入れば決勝進出！</p>
          <table class="rank-table">${[c.player].concat(c.heat).map((e) => `<tr class="${e.isPlayer ? 'me' : ''}"><td><span class="pugslot" data-pug="${e.pug}"></span></td><td>${esc(e.isPlayer ? 'あなた' : e.name)}</td><td class="val">${esc(e.levelName)}</td></tr>`).join('')}</table></div>`;
      } else {
        $('tourTitle').textContent = `決勝 ${c.index + 1} / ${evs.length}`;
        const st = Tour.standings();
        const maxP = Math.max(10, ...st.map((s) => s.points));
        body += `<div class="card"><h3>次の競技：${ne.icon} ${ne.name}</h3>
          <div class="notes">${evs.map((e, i) => `${i < c.index ? '✅' : i === c.index ? '▶' : '・'} ${Score.EVENTS[e].name}`).join('　')}</div></div>
          <div class="card"><h3>総合ポイント</h3><div class="bar-chart">${st.map((s) => `<div class="row ${s.isPlayer ? 'me' : ''}"><span class="nm">${s.rank}. ${esc(s.name)}</span><span class="bar"><b style="width:${(s.points / maxP) * 100}%"></b></span><span class="pt">${s.points}</span></div>`).join('')}</div></div>`;
      }
      $('tourBody').innerHTML = body;
      $('tourBody').querySelectorAll('.pugslot').forEach((s) => { const cv = mkPug(s.dataset.pug, 44, 34); cv.className = 'mini-pug'; s.replaceWith(cv); });
      const foot = $('tourFoot');
      foot.innerHTML = '<button class="btn btn-mid btn-white" id="btnTourQuit">中断</button><button class="btn btn-big btn-gold" id="btnTourGo">競技へ ▶</button>';
      $('btnTourGo').addEventListener('click', () => this.openHowto(nextId));
      $('btnTourQuit').addEventListener('click', () => { this.toast('「大会のつづきから」で再開できます'); this.show('title', false); });
      this.stack = [];
      this.show('tournament', false);
    },
    ceremony() {
      const st = Tour.standings();
      const top3 = st.slice(0, 3);
      const me = st.find((s) => s.isPlayer);
      const scene = new PPO.CeremonyScene(top3, {
        caption: me.rank === 1 ? '優勝おめでとう！世界一のパグ！' : me.rank <= 3 ? `${me.rank}位入賞おめでとう！` : `あなたは${me.rank}位でした`,
        onDone: () => this.tourFinal(),
      });
      this.show('play');
      $('playOverlay').classList.add('hidden');
      $('btnPause').classList.add('hidden');
      Input.setControls(scene.controls());
      Input.handler = (a, ph, t) => { if (Engine.scene && Engine.scene.onInput) Engine.scene.onInput(a, ph, t); };
      Input.enabled = true;
      Engine.setScene(scene);
      requestAnimationFrame(() => Engine.resize());
    },
    tourFinal() {
      const out = Tour.finalize();
      const me = out.standings.find((s) => s.isPlayer);
      Engine.setScene(new PPO.ResultScene({ pug: Tour.cur.pug, pose: out.rank === 1 ? 'joy' : out.rank <= 3 ? 'podium' : 'idle', fireworks: out.rank === 1, theme: 'night' }));
      if (out.rank === 1) Engine.fx.burstConfetti(Engine.W, 160);
      $('resultTitle').textContent = '🏆 大会結果・総合ランキング';
      const medal = out.rank <= 3 ? `<span class="badge medal-${out.rank}">${['🥇 優勝！', '🥈 準優勝', '🥉 3位入賞'][out.rank - 1]}</span>` : '';
      const rows = out.standings.map((s) => `<tr class="${s.isPlayer ? 'me' : ''}"><td class="rk">${s.rank <= 3 ? ['🥇', '🥈', '🥉'][s.rank - 1] : s.rank}</td><td><span class="pugslot" data-pug="${s.pug}"></span></td>
        <td>${esc(s.name)}<span class="lv">${esc(s.levelName || '')}</span></td><td class="val">金${s.golds}</td><td class="pts">${s.points}pt</td></tr>`).join('');
      const res = Tour.cur.results.filter((r) => r.round === 'final').map((r) => `<li>${Score.EVENTS[r.eventId].name}：${r.value == null ? '記録なし' : Score.fmtU(r.eventId, r.value)}（${r.rank}位 +${r.points}pt）</li>`).join('');
      $('resultBody').innerHTML = `<div style="height:24vh"></div>
        <div class="res-hero"><div class="res-value">${me.rank}<small>位</small></div><div class="res-sub">${me.points}ポイント ／ ${Tour.MODES[Tour.cur.mode].name}</div><div class="badge-row">${medal}</div></div>
        <div class="card"><h3>総合ランキング</h3><table class="rank-table">${rows}</table></div>
        <div class="card"><h3>あなたの成績</h3><ul class="notes">${res}</ul></div>`;
      $('resultBody').querySelectorAll('.pugslot').forEach((s) => { const c = mkPug(s.dataset.pug, 44, 34); c.className = 'mini-pug'; s.replaceWith(c); });
      const foot = $('resultFoot');
      foot.innerHTML = '<button class="btn btn-mid btn-white" id="bfTitle">タイトルへ</button><button class="btn btn-mid btn-gold" id="bfAgain">もう一度大会へ</button>';
      $('bfTitle').addEventListener('click', () => this.show('title', false));
      $('bfAgain').addEventListener('click', () => this.tourEntry());
      this.flow = 'single';
      this.show('result', false);
      if (out.unlocked.length) setTimeout(() => this.announceUnlock(out.unlocked), 900);
    },

    // ---------- 記録室 ----------
    renderRecords() {
      const d = Save.data;
      const items = Score.ORDER.map((id) => {
        const e = Score.EVENTS[id], r = d.records[id], wr = Score.worldRecord(id);
        return `<div class="rec-item"><div class="ev-icon" style="background:${e.color}">${e.icon}</div><div style="flex:1">
          <div class="r-name">${e.name}</div><div class="r-val">${r.best == null ? '<span class="empty-note">記録なし</span>' : Score.fmtU(id, r.best)}</div>
          <div class="r-sub">${r.best != null ? `${PPO.PUGS[r.pug] ? PPO.PUGS[r.pug].name : ''} ／ ${r.date || ''} ／ ` : ''}挑戦 ${r.plays}回 ／ 世界記録 ${Score.fmtU(id, wr.value)}${wr.holder === 'あなた' ? '★' : ''}</div></div></div>`;
      }).join('');
      const t = d.tournament;
      const hist = t.history.slice(-6).reverse().map((h) => `<li>${h.date}　${Tour.MODES[h.mode].name}　${h.rank === 0 ? '予選敗退' : h.rank + '位（' + h.points + 'pt）'}　${PPO.PUGS[h.pug].name}・${Score.DIFF[h.difficulty].name}</li>`).join('');
      $('recordsBody').innerHTML = `
        <div class="card"><h3>メダル獲得数</h3><div class="medal-box">
          <div><div class="m">🥇</div><div class="n">${d.medals.gold}</div></div>
          <div><div class="m">🥈</div><div class="n">${d.medals.silver}</div></div>
          <div><div class="m">🥉</div><div class="n">${d.medals.bronze}</div></div></div>
          <p class="notes" style="margin:8px 0 0;font-size:13px">各競技でCPUに勝って3位以内、または大会の総合3位以内で獲得</p></div>
        <div class="card"><h3>大会成績</h3><ul class="notes">
          <li>出場 ${t.played}回 ／ 優勝 <b>${t.wins}回</b> ／ 表彰台 ${t.podiums}回</li>
          <li>最高順位：${t.bestRank ? t.bestRank + '位' : '—'}</li></ul>
          ${hist ? `<ul class="notes" style="font-size:13px">${hist}</ul>` : '<p class="empty-note">まだ大会に出場していません</p>'}</div>
        <div class="rec-grid">${items}</div>
        <div class="card" style="margin-top:12px"><h3>選手</h3><p class="notes">解放済み：${d.unlocked.map((u) => PPO.PUGS[u].name).join('・')}（${d.unlocked.length}/5）</p></div>`;
    },

    // ---------- オプション ----------
    renderOptions() {
      const d = Save.data;
      const seg = Object.keys(Score.DIFF).map((k) => `<button data-diff="${k}" class="${d.difficulty === k ? 'on' : ''}">${Score.DIFF[k].name}</button>`).join('');
      $('optionsBody').innerHTML = `
        <div class="card">
          <div class="opt-row"><span>難易度</span><div class="seg">${seg}</div></div>
          <div class="diff-desc" id="diffDesc">${Score.DIFF[d.difficulty].desc}</div>
          <div class="opt-row"><span>BGM</span><input type="range" min="0" max="100" id="optBgm" value="${Math.round(d.sound.bgm * 100)}"></div>
          <div class="opt-row"><span>効果音</span><input type="range" min="0" max="100" id="optSfx" value="${Math.round(d.sound.sfx * 100)}"></div>
          <div class="opt-row"><span>ミュート</span><button class="switch ${d.sound.muted ? 'on' : ''}" id="optMute" aria-label="ミュート"></button></div>
          <div class="opt-row"><span>振動（対応端末）</span><button class="switch ${d.settings.vibration ? 'on' : ''}" id="optVib" aria-label="振動"></button></div>
          <div class="opt-row"><span>操作ヒント表示</span><button class="switch ${d.settings.hints ? 'on' : ''}" id="optHint" aria-label="ヒント"></button></div>
        </div>
        <div class="card"><h3>データ</h3><p class="notes">記録はこの端末のブラウザに保存されます${Save.available ? '' : '（現在この環境では保存できません）'}。</p>
          <button class="btn btn-mid btn-red" id="optReset" style="width:100%">記録をすべて初期化</button></div>
        <p class="notes" style="color:#fff;text-align:center;font-size:13px">パグパグオリンピック v1.0 ／ 画像・音はすべてプログラムで生成したオリジナルです</p>`;
      const save = () => { Sound.applyVolumes(); Save.save(); };
      $('optionsBody').querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => {
        d.difficulty = b.dataset.diff; save();
        $('optionsBody').querySelectorAll('[data-diff]').forEach((x) => x.classList.toggle('on', x === b));
        $('diffDesc').textContent = Score.DIFF[d.difficulty].desc;
      }));
      $('optBgm').addEventListener('input', (e) => { d.sound.bgm = e.target.value / 100; Sound.applyVolumes(); });
      $('optBgm').addEventListener('change', save);
      $('optSfx').addEventListener('input', (e) => { d.sound.sfx = e.target.value / 100; Sound.applyVolumes(); });
      $('optSfx').addEventListener('change', () => { save(); Sound.play('jump'); });
      const sw = (id, get, set) => $(id).addEventListener('click', (e) => { set(!get()); e.currentTarget.classList.toggle('on', get()); save(); });
      sw('optMute', () => d.sound.muted, (v) => { d.sound.muted = v; });
      sw('optVib', () => d.settings.vibration, (v) => { d.settings.vibration = v; if (v) Engine.vibrate(40); });
      sw('optHint', () => d.settings.hints, (v) => { d.settings.hints = v; });
      $('optReset').addEventListener('click', async () => {
        const ok = await this.confirm('すべての記録・メダル・大会成績・解放した選手を初期化します。\nこの操作は元に戻せません。よろしいですか？', '初期化する', 'やめる');
        if (!ok) return;
        const ok2 = await this.confirm('本当に初期化しますか？', 'はい、初期化', 'いいえ');
        if (!ok2) return;
        Save.reset();
        Sound.settings = Save.data.sound;
        this.toast('記録を初期化しました');
        this.renderOptions();
      });
    },

    // ---------- モーダル・トースト ----------
    confirm(text, ok, cancel) {
      return new Promise((resolve) => {
        $('modalText').textContent = text;
        const btns = $('modalBtns');
        btns.innerHTML = '';
        const mk = (label, cls, v) => { const b = document.createElement('button'); b.className = 'btn btn-mid ' + cls; b.textContent = label; b.onclick = () => { $('modal').classList.add('hidden'); resolve(v); }; btns.appendChild(b); };
        if (cancel) mk(cancel, 'btn-white', false);
        mk(ok || 'OK', cancel ? 'btn-red' : 'btn-gold', true);
        $('modal').classList.remove('hidden');
      });
    },
    alert(text) { return this.confirm(text, 'OK', null); },
    toast(msg) {
      const t = $('toast');
      t.textContent = msg;
      t.classList.remove('hidden');
      clearTimeout(this._tt);
      this._tt = setTimeout(() => t.classList.add('hidden'), 2600);
    },
  };

  PPO.UI = UI;
})();

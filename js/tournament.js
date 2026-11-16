/* 大会モード：選手登録 → 予選 → 決勝（複数競技の合計ポイント） → 表彰式 */
(function () {
  'use strict';
  const PPO = window.PPO;
  const Score = PPO.Score, Save = PPO.Save;

  const MODES = {
    short: { name: 'ショート大会', events: ['sprint100', 'longJump', 'javelin'], desc: '決勝3競技（約5分）' },
    full: { name: 'フル大会（7種競技）', events: ['sprint100', 'hurdles110', 'longJump', 'javelin', 'highJump', 'run400', 'relay'], desc: '決勝7競技（約15分）' },
  };
  const QUALIFY_EVENT = 'sprint100';
  const QUALIFY_PASS = 3; // 予選は6人中3位以内で決勝進出

  const Tournament = {
    MODES, QUALIFY_EVENT, QUALIFY_PASS,
    cur: null,

    create(mode, pug, difficulty) {
      const player = Score.playerEntry(pug);
      this.cur = {
        v: 1,
        mode: MODES[mode] ? mode : 'short',
        pug, difficulty,
        stage: 'qualify',        // qualify → final → ceremony → done / eliminated
        index: 0,
        player,
        heat: Score.makeCPUs(difficulty, pug, 5).map((c) => Object.assign(c, { id: 'h' + c.id })),
        finalists: Score.makeCPUs(difficulty, pug, 5),
        points: {},
        golds: {},
        results: [],
        qualifyRank: null,
        startedAt: new Date().toISOString().slice(0, 16),
      };
      this.cur.finalists.concat([player]).forEach((e) => { this.cur.points[e.id] = 0; this.cur.golds[e.id] = 0; });
      Save.data.tournament.played++;
      this.persist();
      return this.cur;
    },

    events() { return MODES[this.cur.mode].events; },
    currentEvent() { return this.cur.stage === 'qualify' ? QUALIFY_EVENT : this.events()[this.cur.index]; },
    cpusForCurrent() { return this.cur.stage === 'qualify' ? this.cur.heat : this.cur.finalists; },

    // 競技結果（ランク付け済み standings）を反映
    applyResult(eventId, ranked) {
      const c = this.cur;
      if (c.stage === 'qualify') {
        const me = ranked.find((r) => r.isPlayer);
        c.qualifyRank = me ? me.rank : 99;
        const passed = me && !me.dq && me.value != null && me.rank <= QUALIFY_PASS;
        c.stage = passed ? 'final' : 'eliminated';
        c.results.push({ eventId, round: 'qualify', rank: c.qualifyRank, value: me ? me.value : null });
        if (!passed) this.end(0);
        else this.persist();
        return { qualified: passed };
      }
      ranked.forEach((r) => {
        // リレーはチームの代表選手のIDで集計
        const id = r.id;
        if (c.points[id] == null) c.points[id] = 0;
        c.points[id] += r.points || 0;
        if (r.rank === 1 && r.value != null && !r.dq) c.golds[id] = (c.golds[id] || 0) + 1;
      });
      const me = ranked.find((r) => r.isPlayer);
      c.results.push({ eventId, round: 'final', rank: me ? me.rank : null, value: me ? me.value : null, points: me ? me.points : 0 });
      c.index++;
      if (c.index >= this.events().length) c.stage = 'ceremony';
      this.persist();
      return { finished: c.stage === 'ceremony' };
    },

    standings() {
      const c = this.cur;
      const all = c.finalists.concat([c.player]);
      const arr = all.map((e) => ({ id: e.id, name: e.isPlayer ? 'あなた' : e.name, pug: e.pug, isPlayer: !!e.isPlayer, levelName: e.levelName, number: e.number, points: c.points[e.id] || 0, golds: c.golds[e.id] || 0 }));
      arr.sort((a, b) => b.points - a.points || b.golds - a.golds || (a.isPlayer ? -1 : b.isPlayer ? 1 : 0));
      let lastP = null, lastG = null, lastR = 0;
      arr.forEach((e, i) => {
        if (e.points === lastP && e.golds === lastG) e.rank = lastR; else { e.rank = i + 1; lastR = i + 1; }
        lastP = e.points; lastG = e.golds;
      });
      return arr;
    },

    // 表彰式後：大会の最終成績を保存
    finalize() {
      const st = this.standings();
      const me = st.find((s) => s.isPlayer);
      const rank = me.rank;
      const t = Save.data.tournament;
      if (rank === 1) t.wins++;
      if (rank <= 3) {
        t.podiums++;
        Save.data.medals[['gold', 'silver', 'bronze'][rank - 1]]++;
      }
      if (t.bestRank == null || rank < t.bestRank) t.bestRank = rank;
      this.end(rank, me.points);
      const unlocked = Score.checkUnlocks();
      Save.save();
      return { rank, points: me.points, standings: st, unlocked };
    },

    end(rank, points) {
      const c = this.cur;
      const t = Save.data.tournament;
      t.history.push({ rank, points: points || 0, mode: c.mode, date: new Date().toISOString().slice(0, 10), pug: c.pug, difficulty: c.difficulty });
      t.history = t.history.slice(-20);
      c.stage = rank === 0 ? 'eliminated' : 'done';
      Save.data.tournamentInProgress = null;
      Save.save();
    },

    persist() {
      Save.data.tournamentInProgress = JSON.parse(JSON.stringify(this.cur));
      Save.save();
    },

    // 中断した大会の復元（壊れていたら破棄）
    resume() {
      const d = Save.data.tournamentInProgress;
      try {
        if (!d || d.v !== 1 || !MODES[d.mode] || !PPO.PUGS[d.pug] || !Array.isArray(d.finalists) || d.finalists.length !== 5) throw new Error('bad');
        if (!['qualify', 'final', 'ceremony'].includes(d.stage)) throw new Error('stage');
        if (typeof d.index !== 'number' || d.index < 0 || d.index > MODES[d.mode].events.length) throw new Error('index');
        d.finalists.forEach((f) => { if (!f || !PPO.PUGS[f.pug] || typeof f.skill !== 'number') throw new Error('cpu'); });
        if (!Score.DIFF[d.difficulty]) d.difficulty = 'normal';
        this.cur = d;
        return true;
      } catch (e) {
        Save.data.tournamentInProgress = null;
        Save.save();
        return false;
      }
    },
    hasSaved() { return !!Save.data.tournamentInProgress; },
    abandon() { if (this.cur && (this.cur.stage === 'qualify' || this.cur.stage === 'final')) this.end(0); this.cur = null; },
  };

  PPO.Tournament = Tournament;
})();

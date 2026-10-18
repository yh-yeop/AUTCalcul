// 어센틱심볼 강화 계산 — 순수 로직. DOM을 만지지 않는다.
// 브라우저에서는 window.AUT_CALC, Node(테스트)에서는 module.exports 로 노출된다.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AUT_CALC = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class MinHeap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    less(x, y) { return x.cost < y.cost || (x.cost === y.cost && x.idx < y.idx); }
    push(v) {
      const a = this.a; a.push(v);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!this.less(a[i], a[p])) break;
        [a[i], a[p]] = [a[p], a[i]]; i = p;
      }
    }
    peek() { return this.a[0]; }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < a.length && this.less(a[l], a[m])) m = l;
          if (r < a.length && this.less(a[r], a[m])) m = r;
          if (m === i) break;
          [a[i], a[m]] = [a[m], a[i]]; i = m;
        }
      }
      return top;
    }
  }

  function clampInt(v, lo, hi) {
    v = Math.floor(Number(v));
    if (!Number.isFinite(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
  }

  // ---------- 공유 링크 코덱 (JSON → Base64URL) ----------
  // 브라우저와 Node 22 모두 btoa/atob/TextEncoder 를 전역으로 가진다.
  function b64e(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64d(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(str);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /**
   * 계산기 상태를 짧은 문자열로 압축한다. 기본값인 항목은 생략한다.
   * levels: 지역별 한 글자(36진수), growth: 36진수를 '.'로 이어 붙이며 둘 다 뒤쪽 0은 생략.
   * 버전 키가 없으면 1판 형식이다 (형식을 바꿀 때 v 를 추가한다).
   * 되돌릴 때는 decodeState(). 배열 길이 맞추기·값 검증(범위 제한)은 호출하는 쪽에서 한다.
   */
  function encodeState(st) {
    const o = {};
    o.l = (st.levels || []).map((v) => clampInt(v, 0, 35).toString(36)).join('').replace(/0+$/, '');
    const g = (st.growth || []).map((v) => clampInt(v, 0, 1e9).toString(36));
    while (g.length && g[g.length - 1] === '0') g.pop();
    if (g.length) o.g = g.join('.');
    if (st.goal === 'budget') { o.go = 'b'; o.bu = Number(st.budget) || 0; }
    else if (st.goal === 'target') { o.go = 't'; o.tl = clampInt(st.targetLevel, 1, 99); }
    else o.n = clampInt(st.n, 1, 100000);
    if (st.mode === 'pct') o.m = 'p';
    if (st.grand === false) o.gr = 0;
    if (Number(st.tickets) > 0) o.tk = clampInt(st.tickets, 1, 1e6);
    return b64e(JSON.stringify(o));
  }

  // encodeState 의 역함수. 형식이 깨졌으면 null. 생략된 항목은 undefined 로 둔다.
  function decodeState(str) {
    let o;
    try { o = JSON.parse(b64d(String(str || ''))); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || typeof o.l !== 'string') return null;
    const levels = Array.from(o.l, (ch) => parseInt(ch, 36) || 0);
    const growth = typeof o.g === 'string' && o.g ? o.g.split('.').map((v) => parseInt(v, 36) || 0) : [];
    while (growth.length < levels.length) growth.push(0);
    while (levels.length < growth.length) levels.push(0);
    return {
      levels, growth,
      n: o.n,
      goal: o.go === 'b' ? 'budget' : o.go === 't' ? 'target' : 'count',
      budget: o.bu,
      targetLevel: o.tl,
      mode: o.m === 'p' ? 'pct' : 'count',
      grand: o.gr === 0 ? false : true,
      tickets: o.tk,
    };
  }

  /**
   * 데이터(AUT_DATA 형태)를 받아 계산 함수 묶음을 만든다. 데이터 주입식이라
   * 같은 구조(레벨별 필요 성장치, 지역별 레벨별 메소표)의 다른 심볼 체계에도 그대로 쓸 수 있다.
   * D.maxLevel, D.mesoUnit, D.growth(n), D.regions[{meso[], a10, b10, grand, daily}],
   * D.forcePerLevel, D.mainStatPerLevel (선택)
   */
  function create(D) {
    const R = D.regions;
    const MAX = D.maxLevel;

    const growthReq = (n) => D.growth(n);

    // 레벨 n → n+1 강화 메소. 실측 테이블 우선, 없으면 지역 공식.
    function mesoCost(region, n) {
      const v = region.meso && region.meso[n - 1];
      if (Number.isFinite(v)) return v * D.mesoUnit;
      return Math.floor((-54 * n ** 3 + region.a10 * n * n + region.b10 * n) / 10) * D.mesoUnit;
    }

    // 보유 성장치로 도달 가능한 최대 레벨
    function reachable(level, growth) {
      let n = level, g = growth;
      while (n > 0 && n < MAX && g >= growthReq(n)) { g -= growthReq(n); n++; }
      return n;
    }

    // 현재 레벨에서 만렙까지 필요한 총 성장치 (진행률 100% 기준)
    function toMax(n) {
      let t = 0;
      for (let k = Math.max(1, n); k < MAX; k++) t += growthReq(k);
      return t;
    }

    // 레벨 a → b 까지 필요한 총 성장치
    function growthBetween(a, b) {
      let t = 0;
      for (let k = Math.max(1, a); k < b; k++) t += growthReq(k);
      return t;
    }

    // 강화 k회의 효과. 어센틱포스는 레벨당 +10(확정), 주스탯은 일반 직업 기준 근사값(data.js 참고).
    function effects(count) {
      return {
        force: count * (D.forcePerLevel || 0),
        mainStat: count * (D.mainStatPerLevel || 0),
      };
    }

    /**
     * 가장 싼 "다음 1회 강화"를 반복해서 고른다.
     * 지역별 비용은 레벨이 오를수록 증가하고 강화 1회의 효과(어센틱포스 +10)는 지역에 관계없이 같으므로
     * 교환권이 없을 때 이 탐욕 선택은 최소 비용 해다.
     *
     * s.levels[i], s.growth[i], s.grand(그랜드 포함 여부)
     * s.goal: 'count' (s.n 회) | 'budget' (s.budget 메소 안에서 최대 횟수)
     *       | 'target' (활성 지역을 모두 s.targetLevel 까지)
     * s.tickets: 지역 선택 심볼 교환권 개수. 아무 지역에나 쓸 수 있는 심볼로 취급한다.
     *
     * 교환권 처리는 탐욕 휴리스틱이다: 성장치 부족으로 막힌 강화 중 교환권으로 부족분을
     * 채울 수 있고 지금 고를 수 있는 가장 싼 강화보다 싼 것이 있으면 바로 교환권을 써서 진행한다.
     * 교환권을 아껴 뒤의 다른 지역에 쓰는 편이 더 싼 경우가 있을 수 있어 최적해를 보장하지 않는다.
     */
    function solve(s) {
      const goal = s.goal === 'budget' ? 'budget' : s.goal === 'target' ? 'target' : 'count';
      const n = goal === 'count' ? clampInt(s.n, 0, 100000) : Infinity;
      const budget = goal === 'budget' ? Math.max(0, Number(s.budget) || 0) : Infinity;
      // 지역별 상한 레벨: 목표 레벨 모드면 목표 레벨, 아니면 만렙
      const cap = goal === 'target' ? clampInt(s.targetLevel, 1, MAX) : MAX;
      const ticketsTotal = clampInt(s.tickets, 0, 1e6);
      let tickets = ticketsTotal;
      const ticketUse = {}; // idx -> 사용한 교환권 개수

      const active = R.map((r, i) => s.levels[i] > 0 && (s.grand || !r.grand));
      const lvl = s.levels.slice();
      const left = s.growth.slice();
      const heap = new MinHeap();
      const blocked = {}; // idx -> {level, need, have}

      const offer = (i) => {
        const lv = lvl[i];
        if (lv >= cap) return;
        const need = growthReq(lv);
        if (left[i] < need) { blocked[i] = { level: lv, need, have: left[i] }; return; }
        heap.push({ idx: i, level: lv, cost: mesoCost(R[i], lv), need });
      };

      // 막힌 강화 중 교환권으로 뚫을 수 있는 가장 싼 것
      const cheapestViaTicket = () => {
        if (tickets <= 0) return null;
        let best = null;
        for (const k in blocked) {
          const b = blocked[k];
          const lack = b.need - b.have;
          if (lack > tickets) continue;
          const idx = Number(k);
          const c = { idx, level: b.level, cost: mesoCost(R[idx], b.level), need: b.need, tickets: lack };
          if (!best || heap.less(c, best)) best = c;
        }
        return best;
      };

      R.forEach((_, i) => { if (active[i]) offer(i); });

      const steps = [];
      let total = 0;
      let next = null; // 예산 때문에 못 고른 다음 강화
      let exhausted = false; // 더 올릴 수 있는 강화가 없어서 멈춤
      while (steps.length < n) {
        const top = heap.size ? heap.peek() : null;
        const viaTicket = cheapestViaTicket();
        const t = viaTicket && (!top || heap.less(viaTicket, top)) ? viaTicket : top;
        if (!t) { exhausted = true; break; }
        if (total + t.cost > budget) { next = t; break; }
        if (t === viaTicket) {
          tickets -= t.tickets;
          left[t.idx] += t.tickets;
          ticketUse[t.idx] = (ticketUse[t.idx] || 0) + t.tickets;
          delete blocked[t.idx];
        } else {
          heap.pop();
        }
        lvl[t.idx]++;
        left[t.idx] -= t.need;
        total += t.cost;
        steps.push({ ...t, total });
        offer(t.idx);
      }
      if (steps.length >= n && n !== Infinity && !heap.size && !cheapestViaTicket()) exhausted = true;

      const rows = R.map((r, i) => {
        const to = lvl[i];
        const target = goal === 'target' ? Math.max(cap, s.levels[i]) : null;
        // 목표 레벨 모드: 목표까지 더 필요한 성장치와 일퀘 기준 일수
        const lack = target !== null && to < target ? Math.max(0, growthBetween(to, target) - left[i]) : 0;
        return {
          idx: i, region: r, active: active[i],
          from: s.levels[i], to, count: to - s.levels[i],
          meso: steps.filter((x) => x.idx === i).reduce((a, x) => a + x.cost, 0),
          left: left[i],
          target, lack,
          days: lack > 0 && r.daily > 0 ? Math.ceil(lack / r.daily) : 0,
          tickets: ticketUse[i] || 0,
        };
      });

      // 요청 중 못 채운 횟수. count: N - 수행. target: 목표까지 남은 레벨 합. budget: 0
      const short = goal === 'count' ? n - steps.length
        : goal === 'target' ? rows.reduce((a, r) => a + (r.active && r.to < r.target ? r.target - r.to : 0), 0)
        : 0;

      return {
        goal, steps, total, rows, blocked, short,
        target: goal === 'target' ? cap : null,
        // budget 모드: 남은 예산과, 다음 강화를 하려면 추가로 필요한 메소
        budget: goal === 'budget' ? budget : null,
        remaining: goal === 'budget' ? budget - total : null,
        next: next ? { ...next, lack: total + next.cost - budget } : null,
        exhausted,
        tickets: { total: ticketsTotal, used: ticketsTotal - tickets, left: tickets, byRegion: ticketUse },
        effects: effects(steps.length),
      };
    }

    /**
     * 일퀘 타임라인. 오늘(0일)부터 매일 활성 지역(레벨 1 이상·만렙 미만)에 region.daily 개 심볼이
     * 들어온다고 보고 하루씩 solve 를 돌린다.
     *  - doneDay: 목표를 달성하는 가장 빠른 날 (0 = 지금), 못 하면 null
     *  - reason: doneDay 가 null 일 때 'never'(만렙 등으로 불가) | 'maxDays'(maxDays 안에 불가)
     *  - milestones: 가능 횟수가 늘어나는 날마다 {day, count, total}
     * 목표 달성 기준: count/target 은 short === 0, budget 은 성장치가 더 들어와도 횟수가 늘지 않는 시점.
     */
    function timeline(s, maxDays = 400) {
      const grows = R.map((r, i) => (s.levels[i] > 0 && s.levels[i] < MAX && (s.grand || !r.grand) ? r.daily : 0));
      const milestones = [];
      let prev = -1;
      let doneDay = null;
      let reason = null;
      let last = null;
      for (let d = 0; d <= maxDays; d++) {
        const growth = s.growth.map((g, i) => g + grows[i] * d);
        const res = solve({ ...s, growth });
        last = res;
        if (res.steps.length > prev) {
          milestones.push({ day: d, count: res.steps.length, total: res.total });
          prev = res.steps.length;
        }
        if (!growthLimited(res)) { doneDay = d; break; }
        // 막힌 지역이 없는데 목표 미달이면 더 기다려도 소용없다
        if (!Object.keys(res.blocked).some((k) => grows[k] > 0)) { reason = 'never'; break; }
      }
      if (doneDay === null && !reason) reason = 'maxDays';
      return { doneDay, reason, milestones, maxDays, last };
    }

    // 성장치가 더 들어오면 결과가 좋아질 수 있는 상태인가
    function growthLimited(res) {
      if (res.goal !== 'budget') return res.short > 0;
      const lastCost = res.steps.length ? res.steps[res.steps.length - 1].cost : -1;
      return Object.keys(res.blocked).some((k) => {
        const c = mesoCost(R[k], res.blocked[k].level);
        return c <= res.remaining || c < lastCost;
      });
    }

    return { MinHeap, clampInt, growthReq, mesoCost, reachable, toMax, growthBetween, effects, solve, timeline, growthLimited, MAX };
  }

  return { create, MinHeap, clampInt, encodeState, decodeState, b64e, b64d };
});

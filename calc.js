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

  /**
   * 데이터(AUT_DATA 형태)를 받아 계산 함수 묶음을 만든다.
   * D.maxLevel, D.mesoUnit, D.growth(n), D.regions[{meso[], a10, b10, grand, daily}]
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

    /**
     * 가장 싼 "다음 1회 강화"를 반복해서 고른다.
     * 지역별 비용은 레벨이 오를수록 증가하고 강화 1회의 효과(어센틱포스 +10)는 지역에 관계없이 같으므로
     * 이 탐욕 선택이 최소 비용 해다.
     *
     * s.levels[i], s.growth[i], s.grand(그랜드 포함 여부)
     * s.goal: 'count' (s.n 회) | 'budget' (s.budget 메소 안에서 최대 횟수)
     */
    function solve(s) {
      const goal = s.goal === 'budget' ? 'budget' : 'count';
      const n = goal === 'count' ? clampInt(s.n, 0, 100000) : Infinity;
      const budget = goal === 'budget' ? Math.max(0, Number(s.budget) || 0) : Infinity;

      const active = R.map((r, i) => s.levels[i] > 0 && (s.grand || !r.grand));
      const lvl = s.levels.slice();
      const left = s.growth.slice();
      const heap = new MinHeap();
      const blocked = {}; // idx -> {level, need, have}

      const offer = (i) => {
        const lv = lvl[i];
        if (lv >= MAX) return;
        const need = growthReq(lv);
        if (left[i] < need) { blocked[i] = { level: lv, need, have: left[i] }; return; }
        heap.push({ idx: i, level: lv, cost: mesoCost(R[i], lv), need });
      };

      R.forEach((_, i) => { if (active[i]) offer(i); });

      const steps = [];
      let total = 0;
      let next = null; // 예산 때문에 못 고른 다음 강화
      while (steps.length < n && heap.size) {
        const t = heap.peek();
        if (total + t.cost > budget) { next = t; break; }
        heap.pop();
        lvl[t.idx]++;
        left[t.idx] -= t.need;
        total += t.cost;
        steps.push({ ...t, total });
        offer(t.idx);
      }

      const rows = R.map((r, i) => ({
        idx: i, region: r, active: active[i],
        from: s.levels[i], to: lvl[i], count: lvl[i] - s.levels[i],
        meso: steps.filter((x) => x.idx === i).reduce((a, x) => a + x.cost, 0),
        left: left[i],
      }));

      return {
        goal, steps, total, rows, blocked,
        // count 모드: 요청 횟수 중 못 채운 횟수. budget 모드: 0
        short: goal === 'count' ? n - steps.length : 0,
        // budget 모드: 남은 예산과, 다음 강화를 하려면 추가로 필요한 메소
        budget: goal === 'budget' ? budget : null,
        remaining: goal === 'budget' ? budget - total : null,
        next: next ? { ...next, lack: total + next.cost - budget } : null,
        exhausted: !heap.size && !next, // 더 올릴 수 있는 강화가 없음
      };
    }

    return { MinHeap, clampInt, growthReq, mesoCost, reachable, toMax, solve, MAX };
  }

  return { create, MinHeap, clampInt };
});

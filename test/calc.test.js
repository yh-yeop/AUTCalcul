'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../data.js');
const { create } = require('../calc.js');

const C = create(D);
const R = D.regions;
const N = R.length;
const full = (v) => R.map(() => v);
const input = (o) => ({ levels: full(0), growth: full(0), grand: true, goal: 'count', n: 1, budget: 0, ...o });

test('필요 성장치 공식 9n²+20n', () => {
  assert.equal(C.growthReq(1), 29);
  assert.equal(C.growthReq(5), 325);
  assert.equal(C.growthReq(10), 1100);
});

test('지역별 실측 메소 테이블은 폴백 공식과 일치한다', () => {
  for (const r of R) {
    for (let n = 1; n < D.maxLevel; n++) {
      const formula = Math.floor((-54 * n ** 3 + r.a10 * n * n + r.b10 * n) / 10) * D.mesoUnit;
      assert.equal(C.mesoCost(r, n), formula, `${r.id} Lv.${n}`);
    }
  }
});

test('메소 비용은 레벨이 오를수록 단조 증가한다 (탐욕 선택의 전제)', () => {
  for (const r of R) {
    for (let n = 1; n < D.maxLevel - 1; n++) {
      assert.ok(C.mesoCost(r, n) < C.mesoCost(r, n + 1), `${r.id} Lv.${n}`);
    }
  }
});

test('reachable: 성장치로 올라갈 수 있는 레벨', () => {
  assert.equal(C.reachable(0, 99999), 0, '미보유는 그대로');
  assert.equal(C.reachable(1, 28), 1);
  assert.equal(C.reachable(1, 29), 2);
  assert.equal(C.reachable(1, 29 + 76), 3);
  assert.equal(C.reachable(10, 99999), D.maxLevel);
  assert.equal(C.reachable(D.maxLevel, 99999), D.maxLevel);
});

test('toMax: 현재 레벨에서 만렙까지 총 성장치', () => {
  let sum = 0;
  for (let k = 1; k < D.maxLevel; k++) sum += C.growthReq(k);
  assert.equal(C.toMax(1), sum);
  assert.equal(C.toMax(0), sum, '레벨 0도 1부터 계산');
  assert.equal(C.toMax(D.maxLevel - 1), C.growthReq(D.maxLevel - 1));
  assert.equal(C.toMax(D.maxLevel), 0);
});

test('solve(count): 가장 싼 강화부터 N회, 누적 금액 일치', () => {
  const res = C.solve(input({ levels: full(5), growth: full(99999), n: 13 }));
  assert.equal(res.goal, 'count');
  assert.equal(res.steps.length, 13);
  assert.equal(res.short, 0);
  const sum = res.steps.reduce((a, s) => a + s.cost, 0);
  assert.equal(res.total, sum);
  assert.equal(res.steps[12].total, sum);
  // 비용 오름차순으로 선택된다
  for (let i = 1; i < res.steps.length; i++) assert.ok(res.steps[i].cost >= res.steps[i - 1].cost);
  // 모두 Lv.5라면 첫 강화는 가장 싼 세르니움 5→6
  assert.equal(R[res.steps[0].idx].id, 'cer');
  assert.equal(res.steps[0].level, 5);
});

test('solve(count): 레벨 0 지역은 제외, grand=false 면 그랜드 지역 제외', () => {
  const levels = full(3);
  levels[0] = 0; // 세르니움 미보유
  const res = C.solve(input({ levels, growth: full(99999), n: 50, grand: false }));
  assert.equal(res.rows[0].active, false);
  assert.ok(res.steps.every((s) => s.idx !== 0));
  R.forEach((r, i) => { if (r.grand) assert.equal(res.rows[i].active, false); });
  assert.ok(res.steps.every((s) => !R[s.idx].grand));
});

test('solve(count): 성장치가 모자라면 막힌 지역을 보고하고 횟수가 모자란다', () => {
  const levels = full(0);
  levels[0] = 1; levels[1] = 1;
  const growth = full(0);
  growth[0] = C.growthReq(1); // 세르니움: 1→2 딱 한 번
  growth[1] = 0;             // 아르크스: 바로 막힘
  const res = C.solve(input({ levels, growth, n: 5 }));
  assert.equal(res.steps.length, 1);
  assert.equal(res.short, 4);
  assert.deepEqual(res.blocked[1], { level: 1, need: 29, have: 0 });
  assert.equal(res.blocked[0].level, 2, '한 번 올린 뒤 2→3에서 막힘');
  assert.equal(res.rows[0].to, 2);
  assert.equal(res.rows[0].left, 0);
});

test('solve(count): 만렙 지역은 강화하지 않는다', () => {
  const levels = full(D.maxLevel);
  levels[0] = 10;
  const res = C.solve(input({ levels, growth: full(99999), n: 10 }));
  assert.equal(res.steps.length, 1);
  assert.equal(res.rows[0].to, D.maxLevel);
  assert.equal(res.short, 9);
});

// 작은 문제에서 탐욕해가 전수조사 최적해와 같은지 확인한다.
function bruteForce(levels, growth, n, grand) {
  let best = Infinity;
  const rec = (i, left, cost, lv, g) => {
    if (left === 0) { best = Math.min(best, cost); return; }
    if (i >= N) return;
    if (cost >= best) return;
    // 지역 i를 k번 올린다 (k = 0..left)
    let c = cost, l = lv[i], gg = g[i];
    for (let k = 0; k <= left; k++) {
      rec(i + 1, left - k, c, lv, g);
      const active = lv[i] > 0 && (grand || !R[i].grand);
      if (!active || l >= D.maxLevel || gg < C.growthReq(l)) break;
      c += C.mesoCost(R[i], l); gg -= C.growthReq(l); l++;
    }
  };
  rec(0, n, 0, levels, growth);
  return best;
}

test('solve(count)는 전수조사 최적해와 같다 (무작위 소형 사례)', () => {
  let seed = 12345;
  const rnd = (m) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % m; };
  for (let trial = 0; trial < 60; trial++) {
    const levels = R.map(() => rnd(4) === 0 ? 0 : 1 + rnd(D.maxLevel - 1));
    const growth = R.map(() => rnd(3) === 0 ? rnd(400) : 99999);
    const n = 1 + rnd(6);
    const grand = rnd(2) === 0;
    const res = C.solve(input({ levels, growth, n, grand }));
    const bf = bruteForce(levels, growth, n, grand);
    if (bf === Infinity) assert.ok(res.short > 0, `사례 ${trial}: 전수조사도 N회 불가`);
    else {
      assert.equal(res.short, 0, `사례 ${trial}`);
      assert.equal(res.total, bf, `사례 ${trial}: ${JSON.stringify({ levels, growth, n, grand })}`);
    }
  }
});

test('solve(budget): 예산을 넘지 않고 최대 횟수를 고른다', () => {
  const s = input({ levels: full(5), growth: full(99999), goal: 'budget' });
  const all = C.solve({ ...s, goal: 'count', n: 13 });
  // 13회 총액을 예산으로 주면 정확히 13회
  let res = C.solve({ ...s, budget: all.total });
  assert.equal(res.goal, 'budget');
  assert.equal(res.steps.length, 13);
  assert.equal(res.remaining, 0);
  assert.ok(res.next, '14번째 강화는 예산 밖');
  assert.equal(res.next.lack, res.next.cost);
  // 1 메소 모자라면 12회
  res = C.solve({ ...s, budget: all.total - 1 });
  assert.equal(res.steps.length, 12);
  assert.ok(res.total <= all.total - 1);
  assert.equal(res.next.lack, 1);
  // 예산 0이면 0회
  res = C.solve({ ...s, budget: 0 });
  assert.equal(res.steps.length, 0);
  assert.equal(res.total, 0);
  assert.equal(res.short, 0);
});

test('solve(budget): 강화할 게 더 없으면 exhausted, 남은 예산 보고', () => {
  const levels = full(D.maxLevel);
  levels[0] = 10;
  const res = C.solve(input({ levels, growth: full(99999), goal: 'budget', budget: 1e12 }));
  assert.equal(res.steps.length, 1);
  assert.equal(res.exhausted, true);
  assert.equal(res.next, null);
  assert.equal(res.remaining, 1e12 - C.mesoCost(R[0], 10));
});

test('solve: 입력 배열을 바꾸지 않는다', () => {
  const levels = full(3), growth = full(500);
  const a = levels.slice(), b = growth.slice();
  C.solve(input({ levels, growth, n: 7 }));
  assert.deepEqual(levels, a);
  assert.deepEqual(growth, b);
});

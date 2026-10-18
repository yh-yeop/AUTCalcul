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

// ---------- 목표 레벨 모드 ----------
test('solve(target): 활성 지역을 모두 목표 레벨까지 올린다', () => {
  const levels = full(5);
  levels[0] = 9; levels[1] = 0; // 세르니움은 이미 목표 이상, 아르크스 미보유
  const res = C.solve(input({ levels, growth: full(99999), goal: 'target', targetLevel: 7 }));
  assert.equal(res.goal, 'target');
  assert.equal(res.target, 7);
  assert.equal(res.short, 0);
  res.rows.forEach((r, i) => {
    if (!r.active) { assert.equal(r.count, 0); return; }
    assert.equal(r.to, Math.max(7, levels[i]), `${R[i].id}`);
    assert.equal(r.target, Math.max(7, levels[i]));
  });
  assert.equal(res.rows[0].count, 0, '목표 이상인 지역은 건드리지 않음');
  // 6개 활성 지역 × 2레벨 = 12회
  assert.equal(res.steps.length, 12);
  const sum = res.rows.reduce((a, r) => a + r.meso, 0);
  assert.equal(res.total, sum);
});

test('solve(target): 성장치가 모자라면 거기까지만 올리고 부족분·일수를 보고한다', () => {
  const levels = full(0);
  levels[0] = 3; levels[1] = 3;
  const growth = full(0);
  growth[0] = C.growthReq(3) + 10; // 세르니움: 3→4 한 번 뒤 10개 남음
  growth[1] = 99999;
  const res = C.solve(input({ levels, growth, goal: 'target', targetLevel: 6 }));
  const cer = res.rows[0], arc = res.rows[1];
  assert.equal(cer.to, 4);
  assert.equal(arc.to, 6);
  assert.equal(res.short, 2, '세르니움 4→6 두 레벨 남음');
  assert.equal(cer.lack, C.growthReq(4) + C.growthReq(5) - 10);
  assert.equal(cer.days, Math.ceil(cer.lack / R[0].daily));
  assert.equal(arc.lack, 0);
  assert.equal(arc.days, 0);
  assert.ok(res.blocked[0] && res.blocked[0].level === 4);
});

test('solve(target): 목표 레벨은 1~만렙으로 제한된다', () => {
  const res = C.solve(input({ levels: full(10), growth: full(99999), goal: 'target', targetLevel: 99 }));
  assert.equal(res.target, D.maxLevel);
  assert.equal(res.steps.length, N);
  assert.ok(res.rows.every((r) => r.to === D.maxLevel));
});

// ---------- 교환권 ----------
test('solve(tickets): 막힌 강화를 교환권으로 뚫고 사용 내역을 남긴다', () => {
  const levels = full(0);
  levels[0] = 1;
  const growth = full(0);
  growth[0] = 20; // 1→2 에 29 필요, 9개 부족
  let res = C.solve(input({ levels, growth, n: 1 }));
  assert.equal(res.steps.length, 0);
  res = C.solve(input({ levels, growth, n: 1, tickets: 8 }));
  assert.equal(res.steps.length, 0, '8장으로는 부족');
  assert.equal(res.tickets.used, 0);
  res = C.solve(input({ levels, growth, n: 1, tickets: 9 }));
  assert.equal(res.steps.length, 1);
  assert.deepEqual(res.tickets, { total: 9, used: 9, left: 0, byRegion: { 0: 9 } });
  assert.equal(res.rows[0].tickets, 9);
  assert.equal(res.rows[0].left, 0);
  assert.equal(res.steps[0].tickets, 9);
  assert.equal(Object.keys(res.blocked).length, 1, '다음 레벨에서 다시 막힘');
});

test('solve(tickets): 교환권은 지금 고를 수 있는 강화보다 싼 강화에만 쓴다', () => {
  // 세르니움 Lv.3(싸지만 막힘), 기어드락 Lv.3(열려 있지만 비쌈)
  const levels = full(0);
  levels[0] = 3; levels[7] = 3;
  const growth = full(0);
  growth[0] = 0; growth[7] = 99999;
  const res = C.solve(input({ levels, growth, n: 1, tickets: 1000 }));
  assert.equal(res.steps.length, 1);
  assert.equal(res.steps[0].idx, 0, '교환권을 써서 더 싼 세르니움을 고른다');
  assert.equal(res.tickets.used, C.growthReq(3));
  // 반대로 세르니움이 열려 있으면 교환권을 쓰지 않는다
  growth[0] = 99999; growth[7] = 0;
  const res2 = C.solve(input({ levels, growth, n: 1, tickets: 1000 }));
  assert.equal(res2.steps[0].idx, 0);
  assert.equal(res2.tickets.used, 0);
});

test('solve(tickets): 교환권 없이는 결과가 기존과 같다 (tickets=0 또는 미지정)', () => {
  const s = input({ levels: full(4), growth: full(300), n: 9 });
  const a = C.solve(s);
  const b = C.solve({ ...s, tickets: 0 });
  assert.deepEqual(a.steps, b.steps);
  assert.equal(a.tickets.used, 0);
});

test('solve(budget)+tickets: 교환권으로 뚫은 강화도 예산을 넘지 않는다', () => {
  const levels = full(0);
  levels[0] = 1;
  const growth = full(0);
  const cost = C.mesoCost(R[0], 1);
  let res = C.solve(input({ levels, growth, goal: 'budget', budget: cost, tickets: 100 }));
  assert.equal(res.steps.length, 1);
  assert.equal(res.tickets.used, 29);
  res = C.solve(input({ levels, growth, goal: 'budget', budget: cost - 1, tickets: 100 }));
  assert.equal(res.steps.length, 0);
  assert.equal(res.tickets.used, 0, '예산 밖이면 교환권도 쓰지 않음');
  assert.ok(res.next && res.next.tickets === 29);
});

// ---------- 효과 ----------
test('effects: 강화 1회 = 어센틱포스 +10, 주스탯 +mainStatPerLevel', () => {
  assert.deepEqual(C.effects(0), { force: 0, mainStat: 0 });
  assert.deepEqual(C.effects(13), { force: 13 * D.forcePerLevel, mainStat: 13 * D.mainStatPerLevel });
  assert.equal(D.forcePerLevel, 10);
  const res = C.solve(input({ levels: full(5), growth: full(99999), n: 7 }));
  assert.deepEqual(res.effects, C.effects(7));
});

// ---------- 일퀘 타임라인 ----------
test('timeline: 지금 달성 가능하면 0일', () => {
  const tl = C.timeline(input({ levels: full(5), growth: full(99999), n: 5 }));
  assert.equal(tl.doneDay, 0);
  assert.equal(tl.reason, null);
  assert.deepEqual(tl.milestones, [{ day: 0, count: 5, total: tl.last.total }]);
});

test('timeline(count): 일퀘로 성장치가 쌓여 횟수가 늘어나는 날을 기록한다', () => {
  const levels = full(0);
  levels[0] = 1; // 세르니움 하루 30개
  const growth = full(0);
  const tl = C.timeline(input({ levels, growth, n: 2 }));
  // 1→2: 29개 → 1일, 2→3: 76개 → 누적 105개 → 4일(120개)
  assert.equal(tl.doneDay, 4);
  assert.deepEqual(tl.milestones.map((m) => [m.day, m.count]), [[0, 0], [1, 1], [4, 2]]);
  assert.equal(tl.milestones[2].total, C.mesoCost(R[0], 1) + C.mesoCost(R[0], 2));
  assert.equal(tl.last.short, 0);
});

test('timeline(target): 목표 레벨 달성일', () => {
  const levels = full(0);
  levels[1] = 2; // 아르크스 하루 15개, 2→3 에 76개
  const tl = C.timeline(input({ levels, growth: full(0), goal: 'target', targetLevel: 3 }));
  assert.equal(tl.doneDay, Math.ceil(76 / 15));
  assert.equal(tl.last.rows[1].to, 3);
});

test('timeline: 만렙·미보유만 있으면 달성 불가(never), 기간 초과면 maxDays', () => {
  const levels = full(D.maxLevel);
  let tl = C.timeline(input({ levels, growth: full(0), n: 1 }));
  assert.equal(tl.doneDay, null);
  assert.equal(tl.reason, 'never');
  const lv = full(0); lv[1] = 1;
  tl = C.timeline(input({ levels: lv, growth: full(0), n: 1 }), 1);
  assert.equal(tl.doneDay, null);
  assert.equal(tl.reason, 'maxDays');
  assert.equal(tl.maxDays, 1);
});

test('timeline(budget): 성장치가 더 들어와도 횟수가 늘지 않는 날에 끝난다', () => {
  // 세르니움 Lv.1 성장치 0, 예산은 1→2 비용 딱 하나. 29개 모이는 1일째에 1회 가능 → 그 뒤는 예산이 한계
  const levels = full(0);
  levels[0] = 1;
  const tl = C.timeline(input({ levels, growth: full(0), goal: 'budget', budget: C.mesoCost(R[0], 1) }));
  assert.equal(tl.doneDay, 1);
  assert.equal(tl.last.steps.length, 1);
  // 예산이 충분하면 모든 막힘이 풀려야 끝난다 (만렙 직전까지)
  const tl2 = C.timeline(input({ levels, growth: full(0), goal: 'budget', budget: 1e15 }));
  assert.equal(tl2.last.rows[0].to, D.maxLevel);
  assert.equal(tl2.doneDay, Math.ceil(C.toMax(1) / R[0].daily));
});

test('timeline: 입력을 바꾸지 않고 교환권도 반영한다', () => {
  const levels = full(0); levels[0] = 1;
  const growth = full(0);
  const tl = C.timeline(input({ levels, growth, n: 1, tickets: 29 }));
  assert.equal(tl.doneDay, 0);
  assert.deepEqual(growth, full(0));
});

// ---------- 공유 링크 코덱 ----------
const { encodeState, decodeState, b64e, b64d } = require('../calc.js');

test('b64e/b64d: 한글 포함 왕복', () => {
  for (const s of ['', 'abc', '세르니움 Lv.5 → 6', '{"a":[1,2,3]}', '\u0000ÿ']) {
    const e = b64e(s);
    assert.match(e, /^[A-Za-z0-9_-]*$/, 'URL 안전 문자만');
    assert.equal(b64d(e), s);
  }
});

test('encodeState/decodeState: 상태 왕복', () => {
  const st = {
    levels: [5, 5, 0, 11, 1, 2, 3, 10], growth: [9999, 123, 0, 0, 7, 0, 0, 0],
    n: 13, goal: 'budget', budget: 12.5, targetLevel: 9, mode: 'pct', grand: false, tickets: 7,
  };
  const s = encodeState(st);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  const d = decodeState(s);
  assert.deepEqual(d.levels, st.levels);
  assert.deepEqual(d.growth, st.growth);
  assert.equal(d.goal, 'budget');
  assert.equal(d.budget, 12.5);
  assert.equal(d.mode, 'pct');
  assert.equal(d.grand, false);
  assert.equal(d.tickets, 7);
  assert.equal(d.n, undefined, '예산 모드에서는 횟수를 싣지 않는다');
  // 목표 레벨 모드
  const t = decodeState(encodeState({ ...st, goal: 'target' }));
  assert.equal(t.goal, 'target');
  assert.equal(t.targetLevel, 9);
  // 횟수 모드 + 기본값은 생략되어 짧다
  const c = decodeState(encodeState({ levels: [5, 5, 0, 0, 0, 0, 0, 0], growth: [9999, 9999, 0, 0, 0, 0, 0, 0], n: 5, goal: 'count', mode: 'count', grand: true, tickets: 0 }));
  assert.deepEqual(c.levels, [5, 5], '뒤쪽 0은 생략되고 호출 쪽(sanitize)이 채운다');
  assert.deepEqual(c.growth, [9999, 9999]);
  // 성장치만 더 긴 경우 레벨 배열을 맞춰 준다
  const g = decodeState(encodeState({ levels: [3], growth: [0, 0, 5], n: 1 }));
  assert.deepEqual(g.levels, [3, 0, 0]);
  assert.deepEqual(g.growth, [0, 0, 5]);
  assert.equal(c.n, 5);
  assert.equal(c.goal, 'count');
  assert.equal(c.grand, true);
  assert.equal(c.tickets, undefined);
});

test('encodeState: 쿼리 파라미터 형식보다 짧다', () => {
  const st = { levels: [5, 5, 0, 0, 0, 0, 0, 0], growth: [9999, 9999, 0, 0, 0, 0, 0, 0], n: 5, goal: 'budget', budget: 20, mode: 'count', grand: true, tickets: 0 };
  const legacy = 'lv=5.5.0.0.0.0.0.0&g=9999.9999.0.0.0.0.0.0&n=5&go=b&bu=20';
  assert.ok(encodeState(st).length < legacy.length, `${encodeState(st).length} < ${legacy.length}`);
});

test('decodeState: 깨진 입력은 null', () => {
  assert.equal(decodeState(''), null);
  assert.equal(decodeState('!!!'), null);
  assert.equal(decodeState(b64e('[1,2]')), null);
  assert.equal(decodeState(b64e('{"x":1}')), null);
});

(() => {
  'use strict';

  const D = window.AUT_DATA;
  const CALC = window.AUT_CALC;
  const C = CALC.create(D);
  const R = D.regions;
  const MAX = D.maxLevel;
  const STORE_KEY = 'aut-calc-v1';
  const MESO_CALC_URL = 'https://yh-yeop.github.io/meso_calcul/';
  const SITE_URL = 'yh-yeop.github.io/AUTCalcul';
  const TIMELINE_DAYS = 400;
  const $ = (s, el = document) => el.querySelector(s);

  const { growthReq, mesoCost, reachable, toMax, clampInt } = C;

  // ---------- 상태 ----------
  const defaults = () => ({
    levels: R.map(() => 0),
    growth: R.map(() => 0),
    n: 13,
    goal: 'count',   // 'count' = N회 | 'budget' = 예산 안에서 최대 횟수 | 'target' = 전 지역 목표 레벨
    budget: 50,      // 억 단위
    targetLevel: 10, // 목표 레벨 모드의 목표
    mode: 'count',   // 성장치 입력 방식: 'count' 개수 | 'pct' 진행률
    grand: true,
    tickets: 0,      // 지역 선택 심볼 교환권 개수 (전역)
  });

  const GOALS = ['count', 'budget', 'target'];

  let state = loadState();
  let lastResult = null; // 이미지 저장용

  function clampNum(v, lo, hi) {
    v = Number(v);
    if (!Number.isFinite(v)) return lo;
    return Math.min(hi, Math.max(lo, v));
  }

  function sanitize(s) {
    const d = defaults();
    return {
      levels: R.map((_, i) => clampInt(s.levels?.[i] ?? 0, 0, MAX)),
      growth: R.map((_, i) => clampInt(s.growth?.[i] ?? 0, 0, 999999)),
      n: clampInt(s.n ?? d.n, 1, 200),
      goal: GOALS.includes(s.goal) ? s.goal : 'count',
      budget: Math.round(clampNum(s.budget ?? d.budget, 0, 1e6) * 100) / 100,
      targetLevel: clampInt(s.targetLevel ?? d.targetLevel, 1, MAX),
      mode: s.mode === 'pct' ? 'pct' : 'count',
      grand: s.grand !== false,
      tickets: clampInt(s.tickets ?? 0, 0, 99999),
    };
  }

  // 공유 링크(#s= 스냅샷 → 옛 쿼리 파라미터) → localStorage → 기본값
  function loadState() {
    const h = location.hash.match(/[#&]s=([A-Za-z0-9_-]+)/);
    if (h) {
      const dec = CALC.decodeState(h[1]);
      if (dec) return sanitize(dec);
    }
    const p = new URLSearchParams(location.search);
    if (p.has('lv')) {
      const split = (k) => (p.get(k) || '').split('.').map(Number);
      const go = p.get('go');
      return sanitize({
        levels: split('lv'),
        growth: split('g'),
        n: Number(p.get('n')),
        goal: go === 'b' ? 'budget' : go === 't' ? 'target' : 'count',
        budget: p.has('bu') ? Number(p.get('bu')) : undefined,
        targetLevel: p.has('tl') ? Number(p.get('tl')) : undefined,
        mode: p.get('m') === 'p' ? 'pct' : 'count',
        grand: p.get('gr') !== '0',
        tickets: p.has('tk') ? Number(p.get('tk')) : 0,
      });
    }
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch (e) {}
    return defaults();
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function shareUrl() {
    return `${location.origin}${location.pathname}#s=${CALC.encodeState(state)}`;
  }

  // 계산기 입력 → 계산 입력 (예산은 억 → 메소)
  const solveInput = (s) => ({
    levels: s.levels, growth: s.growth, grand: s.grand,
    goal: s.goal, n: s.n, budget: s.budget * 1e8, targetLevel: s.targetLevel, tickets: s.tickets,
  });

  // ---------- 포맷 ----------
  const nf = new Intl.NumberFormat('ko-KR');
  const fmt = (v) => nf.format(v);

  function fmtKor(v) {
    if (v === 0) return '0';
    const eok = Math.floor(v / 1e8);
    const man = Math.floor((v % 1e8) / 1e4);
    const parts = [];
    if (eok) parts.push(`${fmt(eok)}억`);
    if (man) parts.push(`${fmt(man)}만`);
    return parts.join(' ') || fmt(v);
  }

  const fmtEokShort = (v) => `${(v / 1e8).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}억`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = (v) => String(v).padStart(2, '0');
  function dateAfter(days) {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    t.setDate(t.getDate() + days);
    return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`;
  }

  const pctOf = (g, n) => (n > 0 && n < MAX ? Math.round((g / toMax(n)) * 1000) / 10 : 0);
  const fromPct = (p, n) => clampInt(Math.round((p / 100) * toMax(n)), 0, 999999);

  // ---------- 렌더링: 입력 ----------
  const levelOptions = Array.from({ length: MAX + 1 }, (_, i) =>
    `<option value="${i}">${i === 0 ? '미보유' : i === MAX ? `Lv.${i} (MAX)` : `Lv.${i}`}</option>`).join('');

  function buildCards() {
    const mk = (r, i) => `
      <article class="card" data-i="${i}" data-region="${r.id}">
        <div class="card-top">
          <span class="dot" aria-hidden="true"></span>
          <h4>${r.name}</h4>
        </div>
        <div class="fields">
          <label class="f">
            <span>현재 레벨</span>
            <select data-k="level" aria-label="${r.name} 현재 레벨">${levelOptions}</select>
          </label>
          <label class="f">
            <span data-k="glabel">보유 성장치</span>
            <span class="input-unit">
              <input data-k="growth" type="number" inputmode="decimal" min="0" step="1" aria-label="${r.name} 보유 성장치">
              <em data-k="unit">개</em>
            </span>
          </label>
        </div>
        <div class="meter" aria-hidden="true"><i></i></div>
        <p class="card-info" data-k="info"></p>
      </article>`;
    $('#regionsNormal').innerHTML = R.map((r, i) => (r.grand ? '' : mk(r, i))).join('');
    $('#regionsGrand').innerHTML = R.map((r, i) => (r.grand ? mk(r, i) : '')).join('');
    $('#targetLv').innerHTML = Array.from({ length: MAX }, (_, k) => k + 1).map((lv) =>
      `<option value="${lv}">Lv.${lv}${lv === MAX ? ' (MAX)' : ''}</option>`).join('');
  }

  function syncCard(i, { skipInput = false } = {}) {
    const card = document.querySelector(`.card[data-i="${i}"]`);
    const r = R[i];
    const lv = state.levels[i];
    const g = state.growth[i];
    const sel = $('[data-k="level"]', card);
    const inp = $('[data-k="growth"]', card);
    const off = r.grand && !state.grand;

    sel.value = String(lv);
    const disabled = lv === 0 || lv >= MAX;
    inp.disabled = disabled;
    card.classList.toggle('is-empty', lv === 0);
    card.classList.toggle('is-max', lv >= MAX);
    card.classList.toggle('is-off', off);

    $('[data-k="unit"]', card).textContent = state.mode === 'pct' ? '%' : '개';
    $('[data-k="glabel"]', card).textContent = state.mode === 'pct' ? '만렙까지 진행률' : '보유 성장치';
    if (!skipInput) {
      inp.value = disabled ? '' : state.mode === 'pct' ? String(pctOf(g, lv)) : String(g);
    }
    inp.placeholder = disabled ? '—' : '0';

    const info = $('[data-k="info"]', card);
    const bar = $('.meter i', card);
    if (lv === 0) {
      info.textContent = '미보유 · 계산에서 제외';
      bar.style.width = '0';
    } else if (lv >= MAX) {
      info.textContent = '만렙 달성';
      bar.style.width = '100%';
    } else {
      const need = growthReq(lv);
      const reach = reachable(lv, g);
      const pct = state.mode === 'pct';
      const full = toMax(lv);
      bar.style.width = `${Math.min(100, (g / (pct ? full : need)) * 100)}%`;
      if (pct) {
        const head = `${fmt(g)} / ${fmt(full)}개`;
        info.innerHTML = reach > lv
          ? `${head} · <b>Lv.${reach}</b>까지 가능`
          : `${head} · <span class="warn">다음 레벨 ${fmt(need - g)}개 부족</span>`;
      } else if (reach > lv) {
        info.innerHTML = `필요 ${fmt(need)} · 심볼로 <b>Lv.${reach}</b>까지 가능`;
      } else {
        const lack = need - g;
        const days = Math.ceil(lack / r.daily);
        info.innerHTML = `필요 ${fmt(need)} · <span class="warn">${fmt(lack)}개 부족</span> (일퀘 약 ${days}일)`;
      }
    }
  }

  function syncGoal() {
    document.querySelectorAll('.goal-seg [data-goal]').forEach((b) =>
      b.setAttribute('aria-checked', String(b.dataset.goal === state.goal)));
    $('#goalCount').hidden = state.goal !== 'count';
    $('#goalBudget').hidden = state.goal !== 'budget';
    $('#goalTarget').hidden = state.goal !== 'target';
    $('#countN').value = state.n;
    $('#budgetIn').value = state.budget;
    $('#targetLv').value = String(state.targetLevel);
  }

  function syncAll() {
    R.forEach((_, i) => syncCard(i));
    document.querySelectorAll('.seg [data-mode]').forEach((b) =>
      b.setAttribute('aria-checked', String(b.dataset.mode === state.mode)));
    $('#includeGrand').checked = state.grand;
    $('#ticketsIn').value = state.tickets;
    syncGoal();
  }

  // ---------- 렌더링: 결과 ----------
  function renderResult() {
    const res = C.solve(solveInput(state));
    const el = $('#result');
    const anyActive = res.rows.some((r) => r.active);
    lastResult = anyActive ? res : null;

    if (!anyActive) {
      el.innerHTML = `<div class="empty">보유한 심볼의 레벨을 입력하면 결과가 여기에 표시됩니다.</div>`;
      return;
    }

    const changed = res.rows.filter((r) => r.count > 0);
    const done = res.steps.length;
    const budgetMode = res.goal === 'budget';
    const targetMode = res.goal === 'target';

    const notes = [];
    if (budgetMode) {
      if (res.next) {
        const r = R[res.next.idx];
        const viaTicket = res.next.tickets ? `, 교환권 ${fmt(res.next.tickets)}개` : '';
        notes.push(`<li>예산 안에서 <b>${fmt(done)}회</b>까지 가능합니다. 다음으로 싼 강화(${r.name} Lv.${res.next.level}→${res.next.level + 1}, ${fmtKor(res.next.cost)}${viaTicket})까지 하려면 <b>${fmtKor(res.next.lack)}</b>이 더 필요합니다.</li>`);
      } else if (res.exhausted && done > 0) {
        notes.push(`<li>성장치로 올릴 수 있는 강화를 모두 했습니다. 예산이 <b>${fmtKor(res.remaining)}</b> 남습니다.</li>`);
      } else if (done === 0 && res.exhausted) {
        notes.push(`<li class="bad">성장치가 부족하거나 만렙이라 강화할 수 있는 지역이 없습니다.</li>`);
      }
    } else if (targetMode) {
      if (res.short > 0) {
        notes.push(`<li class="bad">성장치가 부족해 <b>${fmt(res.short)}레벨</b>은 올릴 수 없습니다. 지역별 부족 성장치와 일퀘 기준 일수는 표를 확인하세요.</li>`);
      } else if (done === 0) {
        notes.push(`<li>활성 지역이 모두 이미 Lv.${res.target} 이상입니다.</li>`);
      }
    } else if (res.short > 0) {
      notes.push(`<li class="bad">성장치가 부족하거나 만렙이라 <b>${fmt(done)}회</b>까지만 강화할 수 있습니다 (요청 ${fmt(state.n)}회, <b>${fmt(res.short)}회 부족</b>).</li>`);
    }
    if (res.tickets.used > 0) {
      const detail = Object.keys(res.tickets.byRegion).map((k) => `${R[k].name} ${fmt(res.tickets.byRegion[k])}개`).join(', ');
      notes.push(`<li class="ok">지역 선택 교환권 <b>${fmt(res.tickets.used)}개</b> 사용 (${detail})${res.tickets.left ? ` · ${fmt(res.tickets.left)}개 남음` : ''}</li>`);
    }
    res.rows.forEach((row) => {
      const b = res.blocked[row.idx];
      if (!row.active || !b) return;
      // 결과 레벨에서 실제로 막힌 경우만 표시 (목표 레벨 모드는 표에 부족분을 따로 보여 준다)
      if (b.level !== row.to || targetMode) return;
      if (res.short > 0 || row.count > 0 || isCheaperThanLast(row, res)) {
        notes.push(`<li>${row.region.name} Lv.${b.level}→${b.level + 1}: 성장치 ${fmt(b.have)}/${fmt(b.need)} (<b>${fmt(b.need - b.have)}개 부족</b>)으로 제외</li>`);
      }
    });

    const tableRows = res.rows.filter((r) => r.active).map((r) => {
      const lack = targetMode && r.lack > 0
        ? `<div class="lack">목표 Lv.${r.target}까지 ${fmt(r.lack)}개 부족 · 일퀘 약 ${fmt(r.days)}일</div>` : '';
      return `
      <tr class="${r.count ? 'hit' : 'idle'}" data-region="${r.region.id}">
        <th scope="row"><span class="dot" aria-hidden="true"></span>${r.region.name}</th>
        <td class="lv">${r.from} <span class="arrow">→</span> <b>${r.to}</b>${lack}</td>
        <td class="num">${r.count ? `${r.count}회` : '-'}${r.tickets ? `<div class="goal">교환권 ${fmt(r.tickets)}</div>` : ''}</td>
        <td class="num meso">${r.count ? fmtKor(r.meso) : '-'}</td>
      </tr>`;
    }).join('');

    const stepRows = res.steps.map((s, k) => `
      <li data-region="${R[s.idx].id}">
        <span class="no">${k + 1}</span>
        <span class="dot" aria-hidden="true"></span>
        <span class="nm">${R[s.idx].name}</span>
        <span class="lv">${s.level}→${s.level + 1}${s.tickets ? ` <span class="goal">교환권 ${fmt(s.tickets)}</span>` : ''}</span>
        <span class="c">${fmt(s.cost)}</span>
        <span class="acc">누적 ${fmtKor(s.total)}</span>
      </li>`).join('');

    const fx = done
      ? `<span class="total-fx">어센틱포스 <b>+${fmt(res.effects.force)}</b> · 주스탯 약 <b>+${fmt(res.effects.mainStat)}</b> <small>(일반 직업 기준)</small></span>`
      : '';

    const totalBlock = budgetMode
      ? `<div class="total">
          <span class="total-label">예산 ${fmtEokShort(res.budget)} 안에서 · ${fmt(done)}회 강화</span>
          <strong class="total-main">${fmtKor(res.total)} 메소</strong>
          <span class="total-sub">${fmt(res.total)} 사용 · 남은 예산 ${fmtKor(res.remaining)}</span>
          ${fx}
        </div>`
      : targetMode
        ? `<div class="total">
          <span class="total-label">전 지역 Lv.${res.target}까지 · ${fmt(done)}회 강화${res.short ? ` (${fmt(res.short)}레벨 미달)` : ''}</span>
          <strong class="total-main">${fmtKor(res.total)} 메소</strong>
          <span class="total-sub">${fmt(res.total)} (약 ${fmtEokShort(res.total)})</span>
          ${fx}
        </div>`
        : `<div class="total">
          <span class="total-label">총 필요 메소 · ${fmt(done)}회 강화</span>
          <strong class="total-main">${fmtKor(res.total)} 메소</strong>
          <span class="total-sub">${fmt(res.total)} (약 ${fmtEokShort(res.total)})</span>
          ${fx}
        </div>`;

    // 메소 적립 계산기로 목표 메소를 넘겨 "며칠 걸리나"를 바로 본다
    const handoff = !budgetMode && res.total > 0
      ? `<p class="handoff"><a class="ghost link" target="_blank" rel="noopener"
            href="${esc(`${MESO_CALC_URL}#goal=${Math.round(res.total / 1e6) / 100}`)}">메소 적립 계산기에서 ${fmtEokShort(res.total)} 모으는 데 며칠 걸리는지 보기 ↗</a></p>`
      : '';

    el.innerHTML = `
      ${totalBlock}
      ${notes.length ? `<ul class="notes">${notes.join('')}</ul>` : ''}
      ${changed.length ? `
      <div class="summary-line">${changed.map((r) => `<span class="chip" data-region="${r.region.id}"><span class="dot"></span>${r.region.name} ${r.from}→${r.to}</span>`).join('')}</div>` : ''}
      <div class="table-wrap">
        <table class="res">
          <thead><tr><th scope="col">지역</th><th scope="col">현재 → 목표</th><th scope="col" class="num">횟수</th><th scope="col" class="num meso">메소</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      ${done ? `
      <details class="steps">
        <summary>업글 순서 상세 보기 <span>(${done}단계)</span></summary>
        <ol>${stepRows}</ol>
      </details>` : ''}
      ${renderTimeline(res)}
      ${handoff}`;
  }

  // 일퀘 타임라인: 매일 일퀘 심볼이 들어온다고 보고 목표 달성일과 횟수가 늘어나는 날을 표로
  function renderTimeline(res) {
    const tl = C.timeline(solveInput(state), TIMELINE_DAYS);
    const dailyNote = `레벨 1 이상·만렙 미만인 지역에 매일 일퀘 심볼(세르니움 ${R[0].daily}개, 그 외 ${R[1].daily}개)이 들어온다고 가정합니다. 교환권은 입력한 개수만 반영됩니다.`;
    let head;
    if (tl.doneDay === 0) head = `<span class="ok">지금 바로 달성 가능</span>`;
    else if (tl.doneDay !== null) head = `<span>가장 빠른 달성일</span> <span class="ok">${dateAfter(tl.doneDay)}</span> <span>(D+${tl.doneDay})</span>`;
    else if (tl.reason === 'never') head = `<span>일퀘로는 달성할 수 없습니다 (만렙 또는 미보유)</span>`;
    else head = `<span>${TIMELINE_DAYS}일 안에는 달성할 수 없습니다</span>`;

    const goalLabel = res.goal === 'budget' ? '예산을 다 쓰는' : res.goal === 'target' ? `전 지역 Lv.${res.target}` : `${fmt(state.n)}회 강화`;
    const rows = tl.milestones.map((m) => `
      <tr class="${tl.doneDay === m.day ? 'done' : ''}">
        <td>${dateAfter(m.day)}</td>
        <td class="dplus">${m.day === 0 ? '오늘' : `D+${m.day}`}</td>
        <td class="num">${fmt(m.count)}회</td>
        <td class="num meso">${m.total ? fmtKor(m.total) : '-'}</td>
      </tr>`).join('');

    return `
      <details class="timeline">
        <summary>일퀘 타임라인 · ${head}</summary>
        <div class="tl-body">
          <p class="hint">${goalLabel} 목표를 기준으로, k회째 강화가 가능해지는 날입니다. ${dailyNote}</p>
          ${tl.milestones.length > 1 || tl.doneDay !== 0 ? `
          <div class="table-wrap">
            <table class="tl">
              <thead><tr><th scope="col">날짜</th><th scope="col"></th><th scope="col" class="num">가능 횟수</th><th scope="col" class="num meso">총 메소</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>` : `<p class="hint">오늘 기준으로 이미 가능합니다. 더 기다릴 필요가 없습니다.</p>`}
        </div>
      </details>`;
  }

  // 막힌 강화가 실제 선택된 마지막 강화보다 쌌다면(= 심볼만 있었으면 골랐을 강화) 안내
  function isCheaperThanLast(row, res) {
    if (!res.steps.length) return true;
    const last = res.steps[res.steps.length - 1].cost;
    return mesoCost(row.region, row.to) < last;
  }

  // ---------- 결과 이미지 ----------
  function regionColor(id) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--r-${id}`).trim();
    return v || '#8b96ff';
  }

  async function saveImage() {
    const res = lastResult;
    if (!res || !window.AUT_SHARE) { toast('먼저 보유 현황을 입력해 주세요'); return; }
    const done = res.steps.length;
    const title = res.goal === 'budget'
      ? `예산 ${fmtEokShort(res.budget)} 안에서 ${fmt(done)}회 강화`
      : res.goal === 'target'
        ? `전 지역 Lv.${res.target}까지 ${fmt(done)}회 강화${res.short ? ` (${fmt(res.short)}레벨 미달)` : ''}`
        : `${fmt(done)}회 강화에 필요한 최소 메소${res.short ? ` (${fmt(res.short)}회 부족)` : ''}`;
    const subParts = [`${fmt(res.total)} 메소`];
    if (done) subParts.push(`어센틱포스 +${fmt(res.effects.force)}`, `주스탯 약 +${fmt(res.effects.mainStat)}`);
    if (res.goal === 'budget') subParts.push(`남은 예산 ${fmtKor(res.remaining)}`);
    let note = '';
    if (res.tickets.used) note = `지역 선택 교환권 ${fmt(res.tickets.used)}개 사용`;
    const lacking = res.rows.filter((r) => r.active && r.lack > 0);
    if (res.goal === 'target' && lacking.length) {
      note = `${note ? note + ' · ' : ''}성장치 부족: ${lacking.map((r) => `${r.region.name} ${fmt(r.lack)}개(약 ${r.days}일)`).join(', ')}`;
    }
    const rows = res.rows.filter((r) => r.active)
      .sort((a, b) => (b.count > 0) - (a.count > 0))
      .map((r) => ({ name: r.region.name, color: regionColor(r.region.id), from: r.from, to: r.to, count: r.count, meso: fmtKor(r.meso) }));
    try {
      const blob = await window.AUT_SHARE.renderCard({
        eyebrow: '어센틱심볼 최적 강화 계산기',
        title,
        main: `${fmtKor(res.total)} 메소`,
        sub: subParts.join(' · '),
        rows, note,
        url: SITE_URL,
      });
      if (!blob) { toast('이미지를 만들지 못했습니다'); return; }
      const r = await window.AUT_SHARE.saveBlob(blob, `authentic-${res.goal}-${done}.png`);
      if (r === 'downloaded') toast('이미지를 저장했습니다');
    } catch (e) {
      toast('이미지를 만들지 못했습니다');
    }
  }

  // ---------- 이벤트 ----------
  let timer = 0;
  function update() {
    saveState();
    clearTimeout(timer);
    timer = setTimeout(renderResult, 60);
  }

  function onCardInput(e) {
    const card = e.target.closest('.card');
    if (!card) return;
    const i = Number(card.dataset.i);
    const k = e.target.dataset.k;
    if (k === 'level') {
      const prev = state.levels[i];
      const next = clampInt(e.target.value, 0, MAX);
      // 진행률 모드에서는 레벨이 바뀌어도 %를 유지
      if (state.mode === 'pct' && prev > 0 && prev < MAX && next > 0 && next < MAX) {
        state.growth[i] = fromPct(pctOf(state.growth[i], prev), next);
      }
      state.levels[i] = next;
      syncCard(i);
    } else if (k === 'growth') {
      const raw = Number(e.target.value);
      const lv = state.levels[i];
      if (!Number.isFinite(raw) || raw < 0) state.growth[i] = 0;
      else if (state.mode === 'pct') state.growth[i] = fromPct(raw, lv);
      else state.growth[i] = clampInt(raw, 0, 999999);
      syncCard(i, { skipInput: true });
    }
    update();
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function bind() {
    const grids = [$('#regionsNormal'), $('#regionsGrand')];
    grids.forEach((g) => {
      g.addEventListener('input', onCardInput);
      g.addEventListener('change', onCardInput);
      g.addEventListener('focusout', (e) => {
        if (e.target.dataset.k === 'growth') syncCard(Number(e.target.closest('.card').dataset.i));
      });
    });

    document.querySelectorAll('.seg [data-mode]').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      syncAll();
      update();
    }));

    document.querySelectorAll('.goal-seg [data-goal]').forEach((b) => b.addEventListener('click', () => {
      state.goal = GOALS.includes(b.dataset.goal) ? b.dataset.goal : 'count';
      syncGoal();
      update();
    }));

    $('#includeGrand').addEventListener('change', (e) => {
      state.grand = e.target.checked;
      syncAll();
      update();
    });

    const tIn = $('#ticketsIn');
    tIn.addEventListener('input', () => { state.tickets = clampInt(tIn.value || 0, 0, 99999); update(); });
    tIn.addEventListener('blur', () => { tIn.value = state.tickets; });

    const nIn = $('#countN');
    nIn.addEventListener('input', () => { state.n = clampInt(nIn.value || 1, 1, 200); update(); });
    nIn.addEventListener('blur', () => { nIn.value = state.n; });
    document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
      state.n = clampInt(state.n + Number(b.dataset.step), 1, 200);
      nIn.value = state.n;
      update();
    }));

    const bIn = $('#budgetIn');
    bIn.addEventListener('input', () => {
      state.budget = Math.round(clampNum(bIn.value, 0, 1e6) * 100) / 100;
      update();
    });
    bIn.addEventListener('blur', () => { bIn.value = state.budget; });

    $('#targetLv').addEventListener('change', (e) => {
      state.targetLevel = clampInt(e.target.value, 1, MAX);
      update();
    });

    $('#calcBtn').addEventListener('click', () => {
      renderResult();
      $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('#shareBtn').addEventListener('click', async () => {
      const url = shareUrl();
      try {
        await navigator.clipboard.writeText(url);
        toast('공유 링크를 복사했습니다');
      } catch (e) {
        window.prompt('아래 링크를 복사하세요', url);
      }
    });

    $('#imgBtn').addEventListener('click', saveImage);

    $('#resetBtn').addEventListener('click', () => {
      if (!confirm('입력값을 모두 초기화할까요?')) return;
      state = defaults();
      syncAll();
      update();
    });

    $('#themeBtn').addEventListener('click', () => {
      const root = document.documentElement;
      const cur = root.dataset.theme
        || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('aut-theme', next); } catch (e) {}
    });
  }

  // 푸터: 데이터 출처·기준일
  function renderMeta() {
    const m = D.meta || {};
    const a = $('#dataSource');
    if (a && m.url) { a.href = m.url; a.textContent = m.source || a.textContent; }
    const d = $('#dataDate');
    if (d && m.updatedAt) d.textContent = `데이터 기준일 ${m.updatedAt}`;
  }

  buildCards();
  syncAll();
  bind();
  renderMeta();
  renderResult();

  // 공유 링크로 들어온 경우 주소창을 깔끔하게 하고 입력값을 저장
  if (location.search || /[#&]s=/.test(location.hash)) {
    saveState();
    history.replaceState(null, '', location.pathname);
  }

  // 오프라인 캐시 (file:// 로 열면 등록하지 않는다)
  if (/^https?:$/.test(location.protocol) && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  window.__aut = { solve: (s) => C.solve(solveInput(s)), timeline: (s) => C.timeline(solveInput(s)), mesoCost, growthReq, calc: C, shareUrl, saveImage };
})();

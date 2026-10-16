(() => {
  'use strict';

  const D = window.AUT_DATA;
  const C = window.AUT_CALC.create(D);
  const R = D.regions;
  const MAX = D.maxLevel;
  const STORE_KEY = 'aut-calc-v1';
  const MESO_CALC_URL = 'https://yh-yeop.github.io/meso_calcul/';
  const $ = (s, el = document) => el.querySelector(s);

  const { growthReq, mesoCost, reachable, toMax, clampInt } = C;

  // ---------- 상태 ----------
  const defaults = () => ({
    levels: R.map(() => 0),
    growth: R.map(() => 0),
    n: 13,
    goal: 'count',   // 'count' = N회 | 'budget' = 예산 안에서 최대 횟수
    budget: 50,      // 억 단위
    mode: 'count',   // 성장치 입력 방식: 'count' 개수 | 'pct' 진행률
    grand: true,
  });

  let state = loadState();

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
      goal: s.goal === 'budget' ? 'budget' : 'count',
      budget: Math.round(clampNum(s.budget ?? d.budget, 0, 1e6) * 100) / 100,
      mode: s.mode === 'pct' ? 'pct' : 'count',
      grand: s.grand !== false,
    };
  }

  function loadState() {
    const p = new URLSearchParams(location.search);
    if (p.has('lv')) {
      const split = (k) => (p.get(k) || '').split('.').map(Number);
      return sanitize({
        levels: split('lv'),
        growth: split('g'),
        n: Number(p.get('n')),
        goal: p.get('go') === 'b' ? 'budget' : 'count',
        budget: p.has('bu') ? Number(p.get('bu')) : undefined,
        mode: p.get('m') === 'p' ? 'pct' : 'count',
        grand: p.get('gr') !== '0',
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
    const p = new URLSearchParams();
    p.set('lv', state.levels.join('.'));
    p.set('g', state.growth.join('.'));
    p.set('n', state.n);
    if (state.goal === 'budget') { p.set('go', 'b'); p.set('bu', state.budget); }
    if (state.mode === 'pct') p.set('m', 'p');
    if (!state.grand) p.set('gr', '0');
    return `${location.origin}${location.pathname}?${p}`;
  }

  // 계산기 입력 → 계산 입력 (예산은 억 → 메소)
  const solveInput = (s) => ({
    levels: s.levels, growth: s.growth, grand: s.grand,
    goal: s.goal, n: s.n, budget: s.budget * 1e8,
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
    const budget = state.goal === 'budget';
    document.querySelectorAll('.goal-seg [data-goal]').forEach((b) =>
      b.setAttribute('aria-checked', String(b.dataset.goal === state.goal)));
    $('#goalCount').hidden = budget;
    $('#goalBudget').hidden = !budget;
    $('#countN').value = state.n;
    $('#budgetIn').value = state.budget;
  }

  function syncAll() {
    R.forEach((_, i) => syncCard(i));
    document.querySelectorAll('.seg [data-mode]').forEach((b) =>
      b.setAttribute('aria-checked', String(b.dataset.mode === state.mode)));
    $('#includeGrand').checked = state.grand;
    syncGoal();
  }

  // ---------- 렌더링: 결과 ----------
  function renderResult() {
    const res = C.solve(solveInput(state));
    const el = $('#result');
    const anyActive = res.rows.some((r) => r.active);

    if (!anyActive) {
      el.innerHTML = `<div class="empty">보유한 심볼의 레벨을 입력하면 결과가 여기에 표시됩니다.</div>`;
      return;
    }

    const changed = res.rows.filter((r) => r.count > 0);
    const done = res.steps.length;
    const budgetMode = res.goal === 'budget';

    const notes = [];
    if (budgetMode) {
      if (res.next) {
        const r = R[res.next.idx];
        notes.push(`<li>예산 안에서 <b>${fmt(done)}회</b>까지 가능합니다. 다음으로 싼 강화(${r.name} Lv.${res.next.level}→${res.next.level + 1}, ${fmtKor(res.next.cost)})까지 하려면 <b>${fmtKor(res.next.lack)}</b>이 더 필요합니다.</li>`);
      } else if (res.exhausted && done > 0) {
        notes.push(`<li>성장치로 올릴 수 있는 강화를 모두 했습니다. 예산이 <b>${fmtKor(res.remaining)}</b> 남습니다.</li>`);
      } else if (done === 0 && res.exhausted) {
        notes.push(`<li class="bad">성장치가 부족하거나 만렙이라 강화할 수 있는 지역이 없습니다.</li>`);
      }
    } else if (res.short > 0) {
      notes.push(`<li class="bad">성장치가 부족하거나 만렙이라 <b>${fmt(done)}회</b>까지만 강화할 수 있습니다 (요청 ${fmt(state.n)}회, <b>${fmt(res.short)}회 부족</b>).</li>`);
    }
    res.rows.forEach((row) => {
      const b = res.blocked[row.idx];
      if (!row.active || !b) return;
      // 결과 레벨에서 실제로 막힌 경우만 표시
      if (b.level !== row.to) return;
      if (res.short > 0 || row.count > 0 || isCheaperThanLast(row, res)) {
        notes.push(`<li>${row.region.name} Lv.${b.level}→${b.level + 1}: 성장치 ${fmt(b.have)}/${fmt(b.need)} (<b>${fmt(b.need - b.have)}개 부족</b>)으로 제외</li>`);
      }
    });

    const tableRows = res.rows.filter((r) => r.active).map((r) => `
      <tr class="${r.count ? 'hit' : 'idle'}" data-region="${r.region.id}">
        <th scope="row"><span class="dot" aria-hidden="true"></span>${r.region.name}</th>
        <td class="lv">${r.from} <span class="arrow">→</span> <b>${r.to}</b></td>
        <td class="num">${r.count ? `${r.count}회` : '-'}</td>
        <td class="num meso">${r.count ? fmtKor(r.meso) : '-'}</td>
      </tr>`).join('');

    const stepRows = res.steps.map((s, k) => `
      <li data-region="${R[s.idx].id}">
        <span class="no">${k + 1}</span>
        <span class="dot" aria-hidden="true"></span>
        <span class="nm">${R[s.idx].name}</span>
        <span class="lv">${s.level}→${s.level + 1}</span>
        <span class="c">${fmt(s.cost)}</span>
        <span class="acc">누적 ${fmtKor(s.total)}</span>
      </li>`).join('');

    const totalBlock = budgetMode
      ? `<div class="total">
          <span class="total-label">예산 ${fmtEokShort(res.budget)} 안에서 · ${fmt(done)}회 강화</span>
          <strong class="total-main">${fmtKor(res.total)} 메소</strong>
          <span class="total-sub">${fmt(res.total)} 사용 · 남은 예산 ${fmtKor(res.remaining)}</span>
        </div>`
      : `<div class="total">
          <span class="total-label">총 필요 메소 · ${fmt(done)}회 강화</span>
          <strong class="total-main">${fmtKor(res.total)} 메소</strong>
          <span class="total-sub">${fmt(res.total)} (약 ${fmtEokShort(res.total)})</span>
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
      ${handoff}`;
  }

  // 막힌 강화가 실제 선택된 마지막 강화보다 쌌다면(= 심볼만 있었으면 골랐을 강화) 안내
  function isCheaperThanLast(row, res) {
    if (!res.steps.length) return true;
    const last = res.steps[res.steps.length - 1].cost;
    return mesoCost(row.region, row.to) < last;
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
      state.goal = b.dataset.goal === 'budget' ? 'budget' : 'count';
      syncGoal();
      update();
    }));

    $('#includeGrand').addEventListener('change', (e) => {
      state.grand = e.target.checked;
      syncAll();
      update();
    });

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

  buildCards();
  syncAll();
  bind();
  renderResult();

  // 공유 링크로 들어온 경우 주소창을 깔끔하게 하고 입력값을 저장
  if (location.search) {
    saveState();
    history.replaceState(null, '', location.pathname);
  }

  window.__aut = { solve: (s) => C.solve(solveInput(s)), mesoCost, growthReq, calc: C };
})();

// 결과 카드를 캔버스로 그려 PNG 로 내보낸다. classic script — window.AUT_SHARE 로 노출.
// 카드는 BossPaceCalcul 의 share.js 와 같은 방식(1080px 폭, 둥근 패널)이고 폰트는 시스템 폰트만 쓴다.
(function (root) {
  'use strict';

  const P = {
    bg: '#111318', panel: '#1a1d24', line: '#2d313c',
    text: '#e8eaf0', dim: '#9aa1b2', faint: '#6b7284',
    accent: '#8b96ff', warn: '#fb923c',
  };
  const SANS = '"Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, -apple-system, sans-serif';

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // maxW 안에 들어가도록 폰트 크기를 줄인다. 최종 크기를 돌려준다.
  function fitText(ctx, text, maxW, size, weight = '400', min = 18) {
    let s = size;
    for (;;) {
      ctx.font = `${weight} ${s}px ${SANS}`;
      if (ctx.measureText(text).width <= maxW || s <= min) return s;
      s -= 2;
    }
  }

  // 길면 … 으로 자른다
  function ellipsis(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
    return t + '…';
  }

  /**
   * @param {object} d
   * @param {string} d.eyebrow  작은 윗줄 (사이트 이름)
   * @param {string} d.title    모드 설명 ("13회 강화에 필요한 최소 메소")
   * @param {string} d.main     핵심 수치 ("12억 3,456만 메소")
   * @param {string} d.sub      보조 한 줄 ("어센틱포스 +130 · 주스탯 약 +6,500")
   * @param {Array<{name,color,from,to,count,meso}>} d.rows 지역별 현재→목표 (최대 8행)
   * @param {string} [d.note]   경고/안내 한 줄 (성장치 부족 등)
   * @param {string} d.url      하단 주소
   * @returns {Promise<Blob|null>}
   */
  async function renderCard(d) {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    const rows = (d.rows || []).slice(0, 8);
    const W = 1080, M = 72;
    const rowH = 64, headH = 56;
    const tableTop = 400;
    const tableH = headH + rows.length * rowH + 16;
    const noteH = d.note ? 56 : 0;
    const H = tableTop + tableH + noteH + 150;

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // 윗줄 + 액센트 선
    ctx.fillStyle = P.accent;
    ctx.font = `600 24px ${SANS}`;
    ctx.fillText(d.eyebrow, M, M + 20);
    const ebW = ctx.measureText(d.eyebrow).width;
    const g = ctx.createLinearGradient(M + ebW + 18, 0, W - M, 0);
    g.addColorStop(0, P.accent); g.addColorStop(1, 'rgba(139,150,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(M + ebW + 18, M + 10, W - M * 2 - ebW - 18, 2);

    // 제목
    fitText(ctx, d.title, W - M * 2, 40, '600');
    ctx.fillStyle = P.dim;
    ctx.fillText(d.title, M, M + 96);

    // 핵심 수치
    fitText(ctx, d.main, W - M * 2, 92, '800', 40);
    ctx.fillStyle = P.text;
    ctx.fillText(d.main, M, M + 208);

    // 보조 한 줄
    fitText(ctx, d.sub || '', W - M * 2, 28, '400');
    ctx.fillStyle = P.dim;
    ctx.fillText(d.sub || '', M, M + 258);

    // 표 패널
    const tx = M, tw = W - M * 2;
    ctx.save();
    roundRect(ctx, tx, tableTop, tw, tableH, 22);
    ctx.fillStyle = P.panel;
    ctx.fill();
    ctx.restore();

    const colX = { name: tx + 36, lv: tx + tw * 0.46, cnt: tx + tw * 0.66, meso: tx + tw - 36 };
    ctx.fillStyle = P.faint;
    ctx.font = `600 20px ${SANS}`;
    ctx.fillText('지역', colX.name, tableTop + 38);
    ctx.fillText('현재 → 목표', colX.lv, tableTop + 38);
    ctx.textAlign = 'right';
    ctx.fillText('횟수', colX.cnt + 60, tableTop + 38);
    ctx.fillText('메소', colX.meso, tableTop + 38);
    ctx.textAlign = 'left';
    ctx.fillStyle = P.line;
    ctx.fillRect(tx + 24, tableTop + headH, tw - 48, 1);

    rows.forEach((r, i) => {
      const y = tableTop + headH + i * rowH;
      const base = y + rowH / 2 + 9;
      const hit = r.count > 0;
      if (i) { ctx.fillStyle = P.line; ctx.fillRect(tx + 24, y, tw - 48, 1); }
      // 색 점 + 지역명
      ctx.fillStyle = r.color || P.dim;
      ctx.beginPath(); ctx.arc(colX.name + 8, y + rowH / 2, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hit ? P.text : P.dim;
      ctx.font = `${hit ? 700 : 500} 26px ${SANS}`;
      ctx.fillText(ellipsis(ctx, r.name, colX.lv - colX.name - 40), colX.name + 28, base);
      // 레벨
      ctx.font = `500 26px ${SANS}`;
      ctx.fillStyle = P.dim;
      const fromS = `${r.from} → `;
      ctx.fillText(fromS, colX.lv, base);
      ctx.fillStyle = hit ? P.accent : P.dim;
      ctx.font = `${hit ? 700 : 500} 26px ${SANS}`;
      ctx.fillText(String(r.to), colX.lv + ctx.measureText(fromS).width, base);
      // 횟수 · 메소
      ctx.textAlign = 'right';
      ctx.fillStyle = hit ? P.text : P.faint;
      ctx.font = `500 26px ${SANS}`;
      ctx.fillText(hit ? `${r.count}회` : '-', colX.cnt + 60, base);
      ctx.fillText(hit ? r.meso : '-', colX.meso, base);
      ctx.textAlign = 'left';
    });

    // 안내 한 줄
    let y = tableTop + tableH + 44;
    if (d.note) {
      fitText(ctx, d.note, W - M * 2, 24, '500');
      ctx.fillStyle = P.warn;
      ctx.fillText(d.note, M, y);
      y += noteH;
    }

    // 하단 주소
    ctx.fillStyle = P.faint;
    fitText(ctx, d.url, W - M * 2 - 300, 22, '400');
    ctx.fillText(d.url, M, H - M + 14);
    ctx.textAlign = 'right';
    ctx.font = `400 20px ${SANS}`;
    ctx.fillText('계산 결과는 참고용입니다', W - M, H - M + 14);
    ctx.textAlign = 'left';

    return new Promise((res) => cv.toBlob(res, 'image/png'));
  }

  /**
   * 모바일(터치 기기)이면 공유 시트로, 아니면 다운로드로 PNG 를 저장한다.
   * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
   */
  async function saveBlob(blob, name) {
    const file = new File([blob], name, { type: 'image/png' });
    const coarse = root.matchMedia && root.matchMedia('(pointer:coarse)').matches;
    if (coarse && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return 'shared'; }
      catch (err) { if (err && err.name === 'AbortError') return 'cancelled'; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return 'downloaded';
  }

  root.AUT_SHARE = { renderCard, saveBlob };
})(typeof self !== 'undefined' ? self : this);

// 어센틱심볼 데이터 — 나무위키 '어센틱포스' 성장표 기준.
// 패치로 수치가 바뀌면 이 파일만 수정하면 된다.
//
// meso: 레벨 n → n+1 강화 메소 (index 0 = 1→2, index 9 = 10→11), 단위 100,000 메소
// a10/b10: 폴백 공식 계수 ×10  →  메소 = floor((-54n³ + a10·n² + b10·n) / 10) × 100,000
// daily: 일일 퀘스트 심볼 획득량
(function (root) {
  const AUT_DATA = {
    // 데이터 출처와 기준일. 수치를 고치면 updatedAt 도 함께 갱신한다 (화면 푸터에 표시됨).
    meta: {
      source: '나무위키 「어센틱포스」',
      url: 'https://namu.wiki/w/어센틱포스',
      updatedAt: '2026-10-16',
    },
    maxLevel: 11,
    mesoUnit: 100000,
    // 강화 1회(레벨 +1)의 효과
    forcePerLevel: 10,      // 어센틱포스 +10 (확정)
    // 주스탯 +500/레벨은 일반 직업 기준으로 알려진 값이나 출처를 확인하지 못했다 — 확인 필요.
    // 제논(올스탯), 데몬어벤저(MaxHP) 등 예외 직업은 다르다. 화면에는 "약" 으로 표시한다.
    mainStatPerLevel: 500,
    // 필요 성장치 (레벨 n → n+1) = 9n² + 20n
    growth: (n) => 9 * n * n + 20 * n,
    regions: [
      { id: 'cer', name: '세르니움',   grand: false, daily: 30, a10: 1068, b10: 2640,
        meso: [365, 912, 1607, 2419, 3315, 4262, 5229, 6182, 7090, 7920] },
      { id: 'arc', name: '아르크스',   grand: false, daily: 15, a10: 1230, b10: 3000,
        meso: [417, 1048, 1861, 2822, 3900, 5061, 6274, 7507, 8726, 9900] },
      { id: 'odi', name: '오디움',     grand: false, daily: 15, a10: 1392, b10: 3360,
        meso: [469, 1185, 2115, 3225, 4485, 5860, 7320, 8832, 10362, 11880] },
      { id: 'shg', name: '도원경',     grand: false, daily: 15, a10: 1554, b10: 3720,
        meso: [522, 1322, 2368, 3628, 5070, 6660, 8366, 10156, 11998, 13860] },
      { id: 'art', name: '아르테리아', grand: false, daily: 15, a10: 1716, b10: 4080,
        meso: [574, 1459, 2622, 4032, 5655, 7459, 9412, 11481, 13635, 15840] },
      { id: 'car', name: '카르시온',   grand: false, daily: 15, a10: 1878, b10: 4440,
        meso: [626, 1596, 2876, 4435, 6240, 8258, 10458, 12806, 15271, 17820] },
      { id: 'tal', name: '탈라하트',   grand: true,  daily: 15, a10: 3462, b10: 7960,
        meso: [1136, 2933, 5358, 8377, 11960, 16072, 20683, 25760, 31269, 37180] },
      { id: 'gea', name: '기어드락',   grand: true,  daily: 15, a10: 4272, b10: 9760,
        meso: [1397, 3617, 6627, 10393, 14885, 20068, 25912, 32384, 39450, 47080] },
    ],
  };
  if (typeof module === 'object' && module.exports) module.exports = AUT_DATA;
  else root.AUT_DATA = AUT_DATA;
})(typeof self !== 'undefined' ? self : this);

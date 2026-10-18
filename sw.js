// 오프라인 캐시 — 정적 파일을 프리캐시하고 stale-while-revalidate 로 응답한다.
// 파일을 바꾸면 VERSION 을 올려야 옛 캐시가 activate 때 지워진다.
// GitHub Pages 하위 경로(/AUTCalcul/)에서 동작하도록 경로는 모두 상대 경로.
const VERSION = 'v1';
const CACHE = `aut-${VERSION}`;
const PRECACHE = [
  './', './index.html', './style.css', './app.js', './calc.js', './data.js',
  './share.js', './icon.svg', './manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('aut-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 쿼리·해시가 붙은 공유 링크도 같은 캐시 항목을 쓴다
  const key = url.origin + url.pathname;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    const fresh = fetch(req).then((res) => {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => null);
    if (cached) { e.waitUntil(fresh); return cached; }
    return (await fresh) || new Response('오프라인 상태이며 캐시에 없는 파일입니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  })());
});

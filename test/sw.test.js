'use strict';
// 서비스 워커의 프리캐시 목록이 실제 파일과 맞는지 확인한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('sw.js: 프리캐시 목록의 파일이 모두 존재한다', () => {
  const m = src.match(/PRECACHE\s*=\s*\[([^\]]*)\]/);
  assert.ok(m, 'PRECACHE 배열이 있어야 한다');
  const files = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.ok(files.length >= 8);
  for (const f of files) {
    const p = f === './' ? 'index.html' : f.replace(/^\.\//, '');
    assert.ok(fs.existsSync(path.join(root, p)), `${f} 가 없다`);
  }
  for (const must of ['index.html', 'style.css', 'app.js', 'calc.js', 'data.js', 'share.js', 'icon.svg', 'manifest.json']) {
    assert.ok(files.includes(`./${must}`), `${must} 가 프리캐시에 없다`);
  }
});

test('sw.js: 캐시 이름에 버전이 들어가고 index.html 이 모든 스크립트를 싣는다', () => {
  assert.match(src, /CACHE\s*=\s*`aut-\$\{VERSION\}`/);
  assert.match(src, /VERSION\s*=\s*'v\d+'/);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const s of ['data.js', 'calc.js', 'share.js', 'app.js']) assert.ok(html.includes(`src="${s}"`), s);
});

'use strict';

const assert = require('assert');
const pieces = require('../shinigami-pieces.js');

const theme = pieces.createTheme();
const keys = ['wp','wn','wb','wr','wq','wk','bp','bn','bb','br','bq','bk'];

assert.deepEqual(keys.filter((key) => !theme[key]), [], '백과 흑의 모든 기물 SVG를 만든다');
keys.forEach((key) => {
  assert.ok(theme[key].startsWith('data:image/svg+xml'), `${key}는 SVG 데이터 URL이다`);
  const svg = decodeURIComponent(theme[key].split(',').slice(1).join(','));
  assert.ok(svg.includes('viewBox="0 0 116 116"'), `${key}는 동일한 좌표계를 사용한다`);
  assert.ok(svg.includes('#a20f1b'), `${key}에는 붉은 세계관 강조색이 들어간다`);
});
assert.notEqual(theme.wp, theme.bp, '백과 흑은 서로 다른 팔레트를 사용한다');

console.log('shinigami piece theme tests passed');

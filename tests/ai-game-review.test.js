'use strict';

const assert = require('assert');
const review = require('../ai-game-review.js');

const moves = [
  {ply:1, san:'e4', color:'w', classification:'무난한 수', deltaCp:0},
  {ply:2, san:'d5', color:'b', classification:'무난한 수', deltaCp:0},
  {ply:3, san:'e5', color:'w', classification:'부정확', deltaCp:-90},
  {ply:4, san:'Qd7', color:'b', classification:'정확한 수', deltaCp:80},
  {ply:5, san:'Ke2', color:'w', classification:'블런더', deltaCp:-500},
  {ply:6, san:'f6', color:'b', classification:'실수', deltaCp:-150}
];

{
  const request = review.createRequest({playerColor:'w', result:'무승부', pgn:'1. e4 d5', moves});
  assert.equal(request.model, 'gemini-3.1-flash-lite');
  assert.ok(request.prompt.includes('ply와 san'));
  assert.ok(request.prompt.includes('억지 칭찬'));
  assert.ok(request.prompt.includes('괄호 안에서는 존댓말을 절대 쓰지 말고'));
  assert.ok(request.prompt.includes('"하십시오"'));
  assert.ok(request.prompt.includes('summary에도 괄호 속마음을 최소 한 번'));
  assert.ok(request.prompt.includes('딱딱한 명사형 항목'));
  assert.ok(request.prompt.includes('상대 수에는 절대 코멘트를 만들지 마세요'));
  const context = JSON.parse(request.prompt.split('경기 데이터: ')[1]);
  assert.deepEqual(context.moves.map((move) => move.ply), [3, 5], 'Gemini에는 중요한 사용자 수 분석만 보낸다');
  assert.ok(!request.prompt.includes('최대 5개'), '핵심 장면에 고정 개수 제한을 두지 않는다');
}

{
  const response = JSON.stringify({
    summary:'총평', strengths:[], weaknesses:[], goals:[],
    moments:[
      {ply:2, san:'d5', title:'상대 수', comment:'상대 수 코멘트'},
      {ply:3, san:'e5', title:'내 수', comment:'사용자 수 코멘트'}
    ]
  });
  const result = review.parseResponse(response, moves, 'w');
  assert.deepEqual(result.moments.map((moment) => moment.ply), [3, 5], '상대 수 코멘트는 폐기하고 결정적 사용자 수는 보강한다');
  assert.ok(!result.moments.some((moment) => moment.ply === 2), '상대 수에는 코멘트를 붙이지 않는다');
}

{
  const response = JSON.stringify({
    summary:'총평', strengths:[], weaknesses:[], goals:[],
    moments:[{ply:3, san:'Ke2', title:'킹 이동', comment:'중앙의 킹이 위험합니다.'}]
  });
  const result = review.parseResponse(response, moves);
  assert.equal(result.moments[0].ply, 5, 'SAN이 유일하면 잘못된 ply를 실제 위치로 교정한다');
  assert.equal(result.moments[0].san, 'Ke2');
}

{
  const duplicateMoves = [...moves, {ply:7, san:'e5', color:'w', classification:'실수', deltaCp:-150}];
  const response = JSON.stringify({
    summary:'총평', moments:[{ply:5, san:'e5', comment:'불확실한 장면'}]
  });
  const result = review.parseResponse(response, duplicateMoves);
  assert.ok(!result.moments.some((moment) => moment.san === 'e5'), '중복 SAN과 잘못된 ply 조합은 표시하지 않는다');
}

{
  const manyCriticalMoves = Array.from({length:6}, (_, index) => ({
    ply:index * 2 + 1,
    san:`M${index + 1}`,
    color:'w',
    classification:'실수',
    deltaCp:-120 - index,
    rule:`distinct-${index + 1}`
  }));
  assert.equal(review.selectCriticalMoves(manyCriticalMoves, 'w').length, 6, '중요한 수는 5개를 넘어도 자르지 않는다');
}

{
  const decisiveMoves = moves.map((move) => move.ply === 5 ? {
    ...move,
    classification:'블런더',
    deltaCp:-600,
    reasons:['강제 메이트를 허용했어요.']
  } : move);
  const response = JSON.stringify({summary:'총평', moments:[]});
  const result = review.parseResponse(response, decisiveMoves, 'w');
  const decisive = result.moments.find((moment) => moment.ply === 5 && moment.san === 'Ke2');
  assert.ok(decisive, '결정적 실수는 Gemini가 누락해도 복기 장면에 포함한다');
  assert.ok(decisive.innerThought, '결정적 실수에는 강한 속마음을 보장한다');
}

{
  assert.equal(
    review.normalizeInnerThought('체스보드를 장식품으로 보고 계신 건가요?'),
    '체스보드를 장식품으로 보고 있는 건가?',
    '괄호 속 존댓말을 반말 혼잣말로 정규화한다'
  );
}

{
  const response = JSON.stringify({
    summary:'아주 놀라운 경기였네요. (정말 대단한 판단입니다. 이걸 또 놓치셨네요.)',
    weaknesses:['체크부터 확인해봐요. (기본부터 다시 보세요.)'],
    goals:[],
    moments:[]
  });
  const result = review.parseResponse(response, moves, 'w');
  const parentheticalText = [result.summary, ...result.weaknesses]
    .flatMap((text) => [...text.matchAll(/\(([^()]*)\)/g)].map((match) => match[1]))
    .join(' ');
  assert.ok(!/(요|습니다|세요|셨)/.test(parentheticalText), '모든 출력 필드의 괄호 속 존댓말을 제거한다');
}

console.log('ai-game-review tests passed');

'use strict';

const assert = require('assert');
const coach = require('../chess-analysis.js');

function baseRecord(overrides = {}){
  return {
    color:'w',
    move:{color:'w', from:'d2', to:'d4', piece:'p', captured:'', promotion:'', flags:'b', san:'d4'},
    deltaCp:0,
    afterEval:{type:'cp', scoreW:20},
    consequence:{materialLoss:0, sequence:[], endsInMate:false, mateAgainstMover:false},
    verifiedTactic:null,
    principledOpening:false,
    alternatives:[],
    ...overrides
  };
}

{
  const result = coach.classifyRecord(baseRecord({
    deltaCp:-900,
    consequence:{materialLoss:9, sequence:['Qxd1+'], endsInMate:false, mateAgainstMover:false}
  }));
  assert.equal(result.label, '블런더');
  assert.equal(result.rule, 'verified-major-material-loss');
}

{
  const result = coach.classifyRecord(baseRecord({
    deltaCp:30,
    consequence:{materialLoss:9, sequence:['Rxf7'], endsInMate:false, mateAgainstMover:false}
  }));
  assert.equal(result.label, '좋은 수', '보상이 충분한 희생은 기물 손실 규칙으로 덮어쓰지 않는다');
}

{
  const result = coach.classifyRecord(baseRecord({deltaCp:-120, principledOpening:true}));
  assert.equal(result.label, '부정확', '정상적인 오프닝 수를 곧바로 실수로 과장하지 않는다');
}

{
  const record = baseRecord({classification:{label:'무난한 수', tone:'중립', rule:'engine-delta'}});
  const commentary = coach.buildCommentary(record);
  assert.ok(!commentary.body.join(' ').includes('포크'), '검증되지 않은 포크는 해설에 노출하지 않는다');
}

{
  const record = baseRecord({
    deltaCp:-180,
    classification:{label:'실수', tone:'나쁜', rule:'verified-piece-loss'},
    consequence:{materialLoss:3, sequence:['Nxc2+'], endsInMate:false, mateAgainstMover:false},
    verifiedTactic:{
      type:'fork',
      moveSan:'Nxc2+',
      materialGain:3,
      targets:[
        {square:'d4', pieceName:'퀸', value:9},
        {square:'a1', pieceName:'룩', value:5}
      ]
    }
  });
  const commentary = coach.buildCommentary(record);
  assert.ok(commentary.body[0].includes('실제 기물 이득'));
}

{
  const result = coach.classifyRecord(baseRecord({
    deltaCp:-500,
    afterEval:{type:'mate', scoreW:-3},
    consequence:{materialLoss:0, sequence:['Qh4#'], endsInMate:true, mateAgainstMover:true}
  }));
  assert.equal(result.label, '블런더');
  assert.equal(result.rule, 'forced-mate');
}

assert.ok(coach.evalUtility({type:'mate', scoreW:3}, 'w') > 90000);
assert.ok(coach.evalUtility({type:'mate', scoreW:3}, 'b') < -90000);

{
  const record = coach.createMoveRecord({
    ply:1,
    move:{color:'w', from:'d2', to:'d4', piece:'p', flags:'b', san:'d4'},
    fenBefore:'before',
    fenAfter:'after',
    beforeEval:{type:'cp', scoreW:40},
    afterEval:{type:'cp', scoreW:-180},
    beforeAnalysis:{lines:[{multipv:1, uci:'d2d4', san:'d4', type:'cp', scoreW:40, pv:[]}]},
    afterAnalysis:{lines:[]},
    hintSnapshot:{fen:'before', uci:'d2d4', san:'d4', depth:12}
  });
  assert.equal(record.deltaCp, 0, '최선 수는 별도 전후 탐색의 흔들림으로 감점하지 않는다');
  assert.equal(record.rawDeltaCp, -220, '전후 평가 변화는 진단용으로만 보존한다');
  assert.equal(record.classification.label, '최선');
  assert.equal(record.classification.rule, 'matched-engine-best');
  assert.equal(record.followedHint, true);
  assert.equal(coach.buildCommentary(record).alternative, '');
}

{
  const record = coach.createMoveRecord({
    ply:1,
    move:{color:'w', from:'g1', to:'f3', piece:'n', flags:'n', san:'Nf3'},
    fenBefore:'before', fenAfter:'after',
    beforeEval:{type:'cp', scoreW:50}, afterEval:{type:'cp', scoreW:-300},
    beforeAnalysis:{lines:[
      {multipv:1, uci:'d2d4', san:'d4', type:'cp', scoreW:50, pv:[]},
      {multipv:2, uci:'g1f3', san:'Nf3', type:'cp', scoreW:20, pv:[]}
    ]},
    afterAnalysis:{lines:[]}
  });
  assert.equal(record.deltaCp, -30, '후보 수는 같은 탐색의 MultiPV 점수로 비교한다');
  assert.equal(record.classification.label, '좋은 수');
  assert.equal(record.classification.rule, 'candidate-gap');
  assert.equal(record.candidateRank, 2);
  assert.equal(record.comparisonSource, 'same-search-multipv');
}

{
  const record = coach.createMoveRecord({
    ply:1,
    move:{color:'w', from:'g1', to:'f3', piece:'n', flags:'n', san:'Nf3'},
    fenBefore:'before', fenAfter:'after',
    beforeEval:{type:'cp', scoreW:50}, afterEval:{type:'cp', scoreW:20},
    beforeAnalysis:{lines:[
      {multipv:1, uci:'d2d4', san:'d4', type:'cp', scoreW:50, pv:[]},
      {multipv:2, uci:'g1f3', san:'Nf3', type:'cp', scoreW:20, pv:[]}
    ]},
    afterAnalysis:{lines:[]},
    hintSnapshot:{fen:'before', uci:'g1f3', san:'Nf3', depth:12}
  });
  const commentary = coach.buildCommentary(record);
  assert.equal(record.followedHint, true);
  assert.equal(record.matchedEngineBest, false);
  assert.equal(record.classification.label, '좋은 수', '힌트 여부와 후보 점수 등급을 분리한다');
  assert.ok(commentary.body[0].includes('추천 순위가 달라졌습니다'));
}

{
  const result = coach.classifyRecord(baseRecord({
    move:{color:'w', from:'g7', to:'g8', piece:'q', captured:'', promotion:'', flags:'n', san:'Qg8#'},
    deltaCp:-999,
    consequence:{materialLoss:0, sequence:[], endsInMate:true, mateAgainstMover:false}
  }));
  assert.equal(result.label, '최선', '체크메이트 수는 평가 흔들림과 무관하게 최선이다');
  assert.equal(result.rule, 'delivered-mate');
}

console.log('chess-analysis regression tests passed');

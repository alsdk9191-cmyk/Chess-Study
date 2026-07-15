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

console.log('chess-analysis regression tests passed');

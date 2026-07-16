(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ChessCoachAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const PIECE_VALUES = {p:1, n:3, b:3, r:5, q:9, k:0};
  const PIECE_NAMES = {p:'폰', n:'나이트', b:'비숍', r:'룩', q:'퀸', k:'킹'};
  const MAX_MATE_SCORE = 100000;

  function cloneMove(move){
    if (!move) return null;
    return {
      color: move.color,
      from: move.from,
      to: move.to,
      piece: move.piece,
      captured: move.captured || '',
      promotion: move.promotion || '',
      flags: move.flags || '',
      san: move.san || ''
    };
  }

  function getPieceName(type){
    return PIECE_NAMES[type] || '기물';
  }

  function evalUtility(evalInfo, color){
    if (!evalInfo || !Number.isFinite(evalInfo.scoreW)) return null;
    if (evalInfo.type !== 'mate') return color === 'w' ? evalInfo.scoreW : -evalInfo.scoreW;
    const winner = evalInfo.scoreW > 0 ? 'w' : evalInfo.scoreW < 0 ? 'b' : null;
    if (!winner) return 0;
    const distance = Math.min(99, Math.abs(evalInfo.scoreW)) * 100;
    return winner === color ? MAX_MATE_SCORE - distance : -MAX_MATE_SCORE + distance;
  }

  function isMateAgainst(evalInfo, color){
    if (!evalInfo || evalInfo.type !== 'mate' || !evalInfo.scoreW) return false;
    return (evalInfo.scoreW > 0 ? 'w' : 'b') !== color;
  }

  function classifyDelta(deltaCp){
    if (!Number.isFinite(deltaCp)) return {label:'분석 완료', tone:'중립', rule:'missing-evaluation'};
    if (deltaCp >= 140) return {label:'최선', tone:'좋은', rule:'engine-delta'};
    if (deltaCp >= 70) return {label:'정확한 수', tone:'좋은', rule:'engine-delta'};
    if (deltaCp >= 15) return {label:'좋은 수', tone:'좋은', rule:'engine-delta'};
    if (deltaCp >= -45) return {label:'무난한 수', tone:'중립', rule:'engine-delta'};
    if (deltaCp >= -110) return {label:'부정확', tone:'나쁜', rule:'engine-delta'};
    if (deltaCp >= -260) return {label:'실수', tone:'나쁜', rule:'engine-delta'};
    return {label:'블런더', tone:'나쁜', rule:'engine-delta'};
  }

  function classifyCandidateDelta(deltaCp){
    if (!Number.isFinite(deltaCp)) return {label:'분석 완료', tone:'중립', rule:'missing-evaluation'};
    if (deltaCp >= -15) return {label:'정확한 수', tone:'좋은', rule:'candidate-gap'};
    if (deltaCp >= -40) return {label:'좋은 수', tone:'좋은', rule:'candidate-gap'};
    if (deltaCp >= -80) return {label:'무난한 수', tone:'중립', rule:'candidate-gap'};
    if (deltaCp >= -120) return {label:'부정확', tone:'나쁜', rule:'candidate-gap'};
    if (deltaCp >= -250) return {label:'실수', tone:'나쁜', rule:'candidate-gap'};
    return {label:'블런더', tone:'나쁜', rule:'candidate-gap'};
  }

  function isPrincipledOpeningMove(move, fenBefore){
    if (!move || !fenBefore) return false;
    const fullmove = parseInt(String(fenBefore).split(/\s+/)[5], 10);
    if (!Number.isFinite(fullmove) || fullmove > 8) return false;
    if (['d4','e4','d5','e5','c4','c5','Nf3','Nc3','Nf6','Nc6','g3','g6','b3','b6'].includes(move.san)) return true;
    if (['d4','e4','d5','e5','c4','c5'].includes(move.to)) return true;
    return (move.piece === 'n' || move.piece === 'b') && ['1','8'].includes(move.from?.[1]);
  }

  function getMaterialBalance(position, perspective){
    let balance = 0;
    for (const file of 'abcdefgh'){
      for (let rank = 1; rank <= 8; rank += 1){
        const piece = position.get(file + rank);
        if (!piece) continue;
        const value = PIECE_VALUES[piece.type] || 0;
        balance += piece.color === perspective ? value : -value;
      }
    }
    return balance;
  }

  function playUci(position, uci){
    if (!uci || uci.length < 4) return null;
    return position.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.length > 4 ? uci[4] : undefined
    });
  }

  function analyzePvConsequences(ChessCtor, fenAfter, pv, moverColor){
    if (!ChessCtor || !fenAfter || !Array.isArray(pv) || !pv.length) return null;
    try {
      const position = new ChessCtor(fenAfter);
      const initialBalance = getMaterialBalance(position, moverColor);
      const sequence = [];
      let firstReply = null;

      for (const uci of pv.slice(0, 10)){
        const move = playUci(position, uci);
        if (!move) break;
        if (!firstReply) firstReply = move;
        sequence.push(move.san);
        if (move.san.includes('#')) break;
      }

      const finalBalance = getMaterialBalance(position, moverColor);
      const mateWinner = position.in_checkmate() ? (position.turn() === 'w' ? 'b' : 'w') : null;
      return {
        sequence,
        materialLoss: Math.max(0, initialBalance - finalBalance),
        materialSwing: finalBalance - initialBalance,
        firstReplyLoss: firstReply && firstReply.color !== moverColor && firstReply.captured
          ? PIECE_VALUES[firstReply.captured] || 0
          : 0,
        firstReplySan: firstReply ? firstReply.san : '',
        endsInMate: Boolean(mateWinner),
        mateAgainstMover: Boolean(mateWinner && mateWinner !== moverColor)
      };
    } catch {
      return null;
    }
  }

  function getSquare(file, rank){
    return file >= 0 && file < 8 && rank >= 0 && rank < 8
      ? 'abcdefgh'[file] + String(rank + 1)
      : null;
  }

  function getAttackSquares(position, square){
    const piece = position.get(square);
    if (!piece) return [];
    const file = 'abcdefgh'.indexOf(square[0]);
    const rank = parseInt(square[1], 10) - 1;
    const squares = [];
    const add = (df, dr) => {
      const target = getSquare(file + df, rank + dr);
      if (target) squares.push(target);
    };

    if (piece.type === 'p'){
      const direction = piece.color === 'w' ? 1 : -1;
      add(-1, direction);
      add(1, direction);
      return squares;
    }
    if (piece.type === 'n'){
      [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]].forEach(([df, dr]) => add(df, dr));
      return squares;
    }
    if (piece.type === 'k'){
      [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]].forEach(([df, dr]) => add(df, dr));
      return squares;
    }

    const directions = piece.type === 'b'
      ? [[1,1],[1,-1],[-1,1],[-1,-1]]
      : piece.type === 'r'
        ? [[1,0],[-1,0],[0,1],[0,-1]]
        : [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    directions.forEach(([df, dr]) => {
      for (let step = 1; step < 8; step += 1){
        const target = getSquare(file + df * step, rank + dr * step);
        if (!target) break;
        squares.push(target);
        if (position.get(target)) break;
      }
    });
    return squares;
  }

  function getAttackTargets(position, square, defenderColor){
    return getAttackSquares(position, square)
      .map((targetSquare) => ({square:targetSquare, piece:position.get(targetSquare)}))
      .filter((target) => target.piece && target.piece.color === defenderColor && target.piece.type !== 'k')
      .sort((a, b) => (PIECE_VALUES[b.piece.type] || 0) - (PIECE_VALUES[a.piece.type] || 0));
  }

  function verifyTacticalCandidate(ChessCtor, fenAfter, pv, defenderColor){
    if (!ChessCtor || !fenAfter || !Array.isArray(pv) || pv.length < 2) return null;
    try {
      const position = new ChessCtor(fenAfter);
      const attackerColor = position.turn();
      const initialBalance = getMaterialBalance(position, attackerColor);
      const candidate = playUci(position, pv[0]);
      if (!candidate) return null;
      const targets = getAttackTargets(position, candidate.to, defenderColor)
        .filter((target) => (PIECE_VALUES[target.piece.type] || 0) >= 3);
      if (targets.length < 2) return null;

      for (const uci of pv.slice(1, 10)){
        if (!playUci(position, uci)) break;
      }
      const materialGain = getMaterialBalance(position, attackerColor) - initialBalance;
      if (materialGain < 1) return null;

      return {
        type:'fork',
        moveSan:candidate.san,
        materialGain,
        targets:targets.map((target) => ({
          square:target.square,
          pieceName:getPieceName(target.piece.type),
          value:PIECE_VALUES[target.piece.type] || 0
        }))
      };
    } catch {
      return null;
    }
  }

  function classifyRecord(record){
    const deltaCp = record.deltaCp;
    const consequence = record.consequence;
    const materialLoss = consequence?.materialLoss || 0;

    if (record.move?.san?.includes('#')){
      return {label:'최선', tone:'좋은', rule:'delivered-mate'};
    }
    if (record.matchedEngineBest){
      return {label:'최선', tone:'좋은', rule:'matched-engine-best'};
    }
    if (consequence?.mateAgainstMover || isMateAgainst(record.afterEval, record.color)){
      return {label:'블런더', tone:'나쁜', rule:'forced-mate'};
    }

    // Material loss only overrides evaluation when Stockfish also sees inadequate compensation.
    if (Number.isFinite(deltaCp) && deltaCp <= -150 && materialLoss >= 8){
      return {label:'블런더', tone:'나쁜', rule:'verified-major-material-loss'};
    }
    if (Number.isFinite(deltaCp) && deltaCp <= -110 && materialLoss >= 5){
      return {label:deltaCp <= -260 ? '블런더' : '실수', tone:'나쁜', rule:'verified-major-material-loss'};
    }
    if (Number.isFinite(deltaCp) && deltaCp <= -80 && materialLoss >= 3){
      return {label:deltaCp <= -260 ? '블런더' : '실수', tone:'나쁜', rule:'verified-piece-loss'};
    }

    let classification = record.comparisonSource === 'same-search-multipv'
      ? classifyCandidateDelta(deltaCp)
      : classifyDelta(deltaCp);
    if (record.principledOpening
        && !record.verifiedTactic
        && !consequence?.endsInMate
        && materialLoss < 3){
      if (classification.label === '실수' && deltaCp > -150){
        classification = {label:'부정확', tone:'나쁜', rule:'opening-noise-softener'};
      } else if (classification.label === '부정확' && deltaCp > -100){
        classification = {label:'무난한 수', tone:'중립', rule:'opening-noise-softener'};
      }
    }
    return classification;
  }

  function getAlternatives(beforeAnalysis, move){
    if (!beforeAnalysis?.lines?.length || !move) return [];
    const moveUci = move.from + move.to + (move.promotion || '');
    return beforeAnalysis.lines
      .filter((line) => line.uci && line.uci !== moveUci)
      .slice(0, 2)
      .map((line) => line.san || line.uci)
      .filter(Boolean);
  }

  function buildFeatureText(record){
    const move = record.move;
    if (move.san.includes('#')) return '메이트를 만들었습니다.';
    if (move.flags.includes('p')) return '프로모션으로 전력이 늘었습니다.';
    if (move.flags.includes('k') || move.flags.includes('q')) return '캐슬링으로 킹을 안전하게 했습니다.';
    if (move.captured) return (PIECE_VALUES[move.captured] || 0) >= 5 ? '큰 기물을 얻었습니다.' : '기물을 얻었습니다.';
    if (move.san.includes('+')) return '체크로 선택지를 줄였습니다.';
    if (['d4','e4','d5','e5'].includes(move.to)) return '중앙에 영향력을 만들었습니다.';
    if ((move.piece === 'n' || move.piece === 'b') && ['1','8'].includes(move.from[1])) return '기물을 전개했습니다.';
    return '큰 전술 변화는 없습니다.';
  }

  function learningPoint(record){
    if (record.consequence?.mateAgainstMover) return '상대의 체크부터 확인하세요.';
    if ((record.consequence?.materialLoss || 0) >= 3) return '체크, 잡기, 공격 순으로 확인하세요.';
    if (record.move.piece === 'p') return '폰 전진 뒤 열린 대각선을 확인하세요.';
    if (record.move.piece === 'n' || record.move.piece === 'b') return '이동 뒤 남는 기물의 방어를 확인하세요.';
    if (record.move.piece === 'q' || record.move.piece === 'r') return '상대의 템포 공격을 확인하세요.';
    if (record.move.piece === 'k') return '체크와 탈출 칸을 먼저 확인하세요.';
    return '';
  }

  function alternativesText(alternatives){
    if (!alternatives.length) return '';
    return alternatives.length === 1 ? alternatives[0] : `${alternatives[0]} 또는 ${alternatives[1]}`;
  }

  function buildCommentary(record){
    const deltaCp = record.deltaCp;
    const alternatives = alternativesText(record.alternatives);
    const consequence = record.consequence;
    const tactic = record.verifiedTactic;
    let reason = '';
    let hintNote = '';

    if (record.move.san.includes('#')){
      reason = '체크메이트를 완성했습니다.';
    } else if (record.followedHint && record.matchedEngineBest){
      reason = '표시된 힌트를 따랐고, 확정 분석에서도 최선 수입니다.';
    } else if (record.matchedEngineBest){
      reason = '엔진의 최선 수를 두었습니다.';
    } else {
      if (record.followedHint){
        hintNote = '당시 표시된 힌트를 따랐지만, 확정 분석에서는 추천 순위가 달라졌습니다.';
      }
    }

    if (!reason && consequence?.mateAgainstMover){
      reason = '강제 메이트를 허용했습니다.';
    } else if (!reason && tactic){
      const targets = tactic.targets.map((target) => `${target.square}의 ${target.pieceName}`).join('와 ');
      reason = `${tactic.moveSan} 뒤 ${targets}를 동시에 노리며 실제 기물 이득이 남습니다.`;
    } else if (!reason && (consequence?.materialLoss || 0) >= 3 && Number.isFinite(deltaCp) && deltaCp <= -80){
      const prefix = consequence.firstReplyLoss >= 3 && consequence.firstReplySan
        ? `${consequence.firstReplySan} 이후`
        : '예상 수순대로 진행하면';
      reason = `${prefix} 기물 약 ${consequence.materialLoss}점 손해입니다.`;
    } else if (!reason && Number.isFinite(deltaCp) && deltaCp <= -220){
      reason = alternatives ? `${alternatives}가 훨씬 안전했습니다.` : '상대 전술을 허용했습니다.';
    } else if (!reason && Number.isFinite(deltaCp) && deltaCp <= -95){
      reason = alternatives ? `${alternatives}가 더 안전했습니다.` : '더 안전한 수가 있었습니다.';
    } else if (!reason && Number.isFinite(deltaCp) && deltaCp <= -35){
      reason = alternatives ? `${alternatives}가 더 정확했습니다.` : '조금 더 정확한 수가 있었습니다.';
    } else if (!reason) {
      reason = buildFeatureText(record);
    }

    const point = !record.followedHint && !record.matchedEngineBest && Number.isFinite(deltaCp) && deltaCp < 15
      ? learningPoint(record)
      : '';
    return {
      title:record.classification.label,
      body:[hintNote, reason, point].filter(Boolean),
      expected:consequence?.sequence?.slice(0, 4).join(' ') || '',
      alternative:!record.matchedEngineBest && Number.isFinite(deltaCp) && deltaCp < 15 ? alternatives : '',
      facts:{
        rule:record.classification.rule,
        deltaCp:Number.isFinite(deltaCp) ? Math.round(deltaCp) : null,
        materialLoss:consequence?.materialLoss || 0,
        mateAgainstMover:Boolean(consequence?.mateAgainstMover),
        verifiedTactic:tactic || null
      }
    };
  }

  function createMoveRecord(options){
    const move = cloneMove(options.move);
    const beforeUtility = evalUtility(options.beforeEval, move.color);
    const afterUtility = evalUtility(options.afterEval, move.color);
    const rawDeltaCp = Number.isFinite(beforeUtility) && Number.isFinite(afterUtility)
      ? afterUtility - beforeUtility
      : null;
    const moveUci = move.from + move.to + (move.promotion || '');
    const beforeLines = options.beforeAnalysis?.lines || [];
    const bestLine = beforeLines.find((line) => line.multipv === 1) || beforeLines[0] || null;
    const playedLine = beforeLines.find((line) => line.uci === moveUci) || null;
    const bestUtility = evalUtility(bestLine, move.color);
    const playedUtility = evalUtility(playedLine, move.color);
    const matchedEngineBest = Boolean(bestLine?.uci && bestLine.uci === moveUci);
    const candidateRank = playedLine
      ? (Number.isFinite(playedLine.multipv) ? playedLine.multipv : beforeLines.indexOf(playedLine) + 1)
      : null;
    const hintSnapshot = options.hintSnapshot || null;
    const followedHint = Boolean(
      hintSnapshot
      && hintSnapshot.fen === options.fenBefore
      && hintSnapshot.uci === moveUci
    );
    const deltaCp = matchedEngineBest
      ? 0
      : Number.isFinite(bestUtility) && Number.isFinite(playedUtility)
        ? playedUtility - bestUtility
        : rawDeltaCp;
    const comparisonSource = matchedEngineBest || (Number.isFinite(bestUtility) && Number.isFinite(playedUtility))
      ? 'same-search-multipv'
      : 'before-after-fallback';
    const replyLine = options.afterAnalysis?.lines?.find((line) => line.multipv === 1)
      || options.afterAnalysis?.lines?.[0]
      || null;
    const pv = replyLine?.pv || [];
    const consequence = analyzePvConsequences(options.Chess, options.fenAfter, pv, move.color);
    const tacticalCandidate = verifyTacticalCandidate(options.Chess, options.fenAfter, pv, move.color);
    const verifiedTactic = tacticalCandidate
      && Number.isFinite(deltaCp)
      && deltaCp <= -35
      && (consequence?.materialLoss || 0) >= 1
      ? tacticalCandidate
      : null;
    const record = {
      ply:options.ply,
      color:move.color,
      move,
      fenBefore:options.fenBefore,
      fenAfter:options.fenAfter,
      beforeEval:options.beforeEval ? {...options.beforeEval} : null,
      afterEval:options.afterEval ? {...options.afterEval} : null,
      deltaCp,
      rawDeltaCp,
      centipawnLoss:Number.isFinite(deltaCp) ? Math.max(0, -deltaCp) : null,
      bestMove:bestLine?.san || bestLine?.uci || '',
      matchedEngineBest,
      followedHint,
      candidateRank,
      comparisonSource,
      hintSnapshot:hintSnapshot ? {...hintSnapshot} : null,
      principalVariation:[...pv],
      alternatives:getAlternatives(options.beforeAnalysis, move),
      consequence,
      verifiedTactic,
      principledOpening:isPrincipledOpeningMove(move, options.fenBefore)
    };
    record.classification = classifyRecord(record);
    return record;
  }

  return {
    analyzePvConsequences,
    buildCommentary,
    classifyCandidateDelta,
    classifyDelta,
    classifyRecord,
    createMoveRecord,
    evalUtility,
    isPrincipledOpeningMove,
    verifyTacticalCandidate
  };
});

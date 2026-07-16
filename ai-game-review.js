(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChessAIReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const MODEL = 'gemini-3.1-flash-lite';
  const TEMPERATURE = 1.0;
  const BASE_OUTPUT_TOKENS = 1000;
  const MAX_TEXT_LENGTH = 700;
  const MAX_REVIEW_MOVES = 160;

  function shortText(value){
    return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_LENGTH) : '';
  }

  function normalizeInnerThought(value){
    return shortText(value)
      .replace(/^\(|\)$/g, '')
      .replace(/계신/g, '있는')
      .replace(/하시는/g, '하는')
      .replace(/하셨습니다/g, '했네')
      .replace(/했습니다/g, '했네')
      .replace(/하시네요/g, '하네')
      .replace(/하셨네요/g, '했네')
      .replace(/했네요/g, '했네')
      .replace(/셨/g, '었')
      .replace(/겠습니다/g, '겠네')
      .replace(/있습니다/g, '있네')
      .replace(/없습니다/g, '없네')
      .replace(/됩니다/g, '돼')
      .replace(/입니다/g, '이네')
      .replace(/합니다/g, '해')
      .replace(/주세요/g, '줘')
      .replace(/보세요/g, '봐')
      .replace(/하세요/g, '해')
      .replace(/이세요/g, '이야')
      .replace(/건가요/g, '건가')
      .replace(/인가요/g, '인가')
      .replace(/군요/g, '군')
      .replace(/네요/g, '네')
      .replace(/해요/g, '해')
      .replace(/어요/g, '어')
      .replace(/아요/g, '아')
      .replace(/습니다/g, '네')
      .replace(/세요/g, '')
      .replace(/죠(?=[.!?]|$)/g, '지')
      .replace(/요(?=[.!?]|$)/g, '')
      .trim();
  }

  function normalizeParentheticalThoughts(value){
    return shortText(value).replace(/\(([^()]*)\)/g, (_, thought) => `(${normalizeInnerThought(thought)})`);
  }

  function normalizeMoves(moves){
    return Array.isArray(moves) ? moves.slice(0, MAX_REVIEW_MOVES).map((move) => ({
      ply:Number(move?.ply),
      san:shortText(move?.san),
      color:shortText(move?.color),
      classification:shortText(move?.classification),
      deltaCp:Number.isFinite(move?.deltaCp) ? Math.round(move.deltaCp) : null,
      rawDeltaCp:Number.isFinite(move?.rawDeltaCp) ? Math.round(move.rawDeltaCp) : null,
      bestMove:shortText(move?.bestMove),
      followedHint:Boolean(move?.followedHint),
      matchedEngineBest:Boolean(move?.matchedEngineBest),
      candidateRank:Number.isFinite(move?.candidateRank) ? Number(move.candidateRank) : null,
      comparisonSource:shortText(move?.comparisonSource),
      reasons:Array.isArray(move?.reasons) ? move.reasons.map(shortText).filter(Boolean).slice(0, 2) : [],
      expected:shortText(move?.expected),
      alternative:shortText(move?.alternative),
      rule:shortText(move?.rule),
      materialLoss:Number.isFinite(move?.materialLoss) ? Math.max(0, Number(move.materialLoss)) : 0,
      mateAgainstMover:Boolean(move?.mateAgainstMover),
      verifiedTactic:Boolean(move?.verifiedTactic),
      isCheck:Boolean(move?.isCheck),
      isMate:Boolean(move?.isMate),
      captured:shortText(move?.captured),
      promotion:shortText(move?.promotion)
    })).filter((move) => Number.isInteger(move.ply) && move.ply > 0 && move.san) : [];
  }

  function getCriticalMoveInfo(move){
    const loss = Number.isFinite(move.deltaCp) ? Math.max(0, -move.deltaCp) : 0;
    if (move.mateAgainstMover || move.rule === 'forced-mate') return {key:'allowed-mate', score:10000 + loss};
    if (move.isMate) return {key:'delivered-mate', score:9500};
    if (move.materialLoss >= 3) return {key:'material-loss', score:8000 + move.materialLoss * 100 + loss};
    if (move.verifiedTactic) return {key:'verified-tactic', score:7500 + loss};
    if (move.classification === '블런더') return {key:`blunder:${move.rule || 'evaluation'}`, score:7000 + loss};
    if (move.classification === '실수') return {key:`mistake:${move.rule || 'evaluation'}`, score:6000 + loss};
    if (loss >= 80) return {key:'large-inaccuracy', score:5000 + loss};
    if (move.promotion) return {key:'promotion', score:4500};
    if (move.captured === 'q' || move.captured === 'r') return {key:'major-capture', score:4000 + (move.captured === 'q' ? 900 : 500)};
    if ((move.classification === '최선' || move.classification === '정확한 수')
        && (move.isCheck || move.captured || move.promotion)){
      return {key:'noteworthy-best', score:3500 + Math.max(0, move.deltaCp || 0)};
    }
    return null;
  }

  function selectCriticalMoves(moves, playerColor){
    const color = playerColor === 'b' ? 'b' : 'w';
    const selected = [];
    normalizeMoves(moves)
      .filter((move) => move.color === color)
      .sort((a, b) => a.ply - b.ply)
      .forEach((move) => {
        const importance = getCriticalMoveInfo(move);
        if (!importance) return;
        const previous = selected[selected.length - 1];
        if (previous && previous.importance.key === importance.key && move.ply - previous.move.ply <= 2){
          if (importance.score > previous.importance.score) selected[selected.length - 1] = {move, importance};
          return;
        }
        selected.push({move, importance});
      });
    return selected.map((item) => item.move);
  }

  function getDecisiveMove(moves, playerColor){
    const severity = {'실수':2, '블런더':3};
    return normalizeMoves(moves)
      .filter((move) => move.color === playerColor && (severity[move.classification] || move.deltaCp <= -110))
      .sort((a, b) => {
        const aScore = (severity[a.classification] || 1) * 100000 + Math.max(0, -(a.deltaCp || 0));
        const bScore = (severity[b.classification] || 1) * 100000 + Math.max(0, -(b.deltaCp || 0));
        return bScore - aScore || b.ply - a.ply;
      })[0] || null;
  }

  function createRequest(options){
    const playerColor = options?.playerColor === 'b' ? 'b' : 'w';
    const moves = selectCriticalMoves(options?.moves, playerColor);
    const decisiveMove = getDecisiveMove(moves, playerColor);
    const context = {
      playerColor:playerColor === 'b' ? 'black' : 'white',
      result:shortText(options?.result),
      pgn:String(options?.pgn || '').trim().slice(0, 12000),
      moves,
      decisiveMove,
      coachStyle:shortText(options?.coachStyle)
    };
    const prompt = [
      '당신은 한국어 체스 복기 코치입니다.',
      '한 수씩 재판정하지 말고 제공된 Stockfish 판정과 이유를 사실로 사용해 경기 전체의 흐름과 반복된 습관을 분석하세요.',
      'moves에는 Stockfish가 선별한 사용자의 중요한 수만 있습니다. 상대 수에는 절대 코멘트를 만들지 마세요.',
      'moves의 각 수마다 moment를 하나씩 작성하고 누락하거나 추가하지 마세요. moves가 비어 있으면 moments는 빈 배열로 두세요.',
      '각 moment는 입력에 존재하는 ply와 san을 정확히 한 쌍으로 복사하세요.',
      '과장된 전술이나 입력에 없는 원인을 만들지 마세요.',
      'followedHint는 당시 화면의 엔진 힌트를 사용자가 따른 기록일 뿐 수의 등급이 아닙니다. classification과 deltaCp로 수의 품질을 설명하세요.',
      'followedHint가 true인데 matchedEngineBest가 false라면 탐색 과정에서 추천 순위가 달라진 경우입니다. 사용자를 비난하거나 조롱하지 말고 분석 불확실성과 현재 더 나은 후보를 설명하세요.',
      'matchedEngineBest가 true인 수에는 대안이 더 좋았다고 쓰지 마세요.',
      '말투는 아래 coachStyle 지시를 가장 우선해서 따르세요.',
      context.coachStyle,
      'coachStyle은 moments뿐 아니라 summary, strengths, weaknesses, goals의 모든 문장에 뚜렷하게 적용하세요. 특히 summary를 평범한 분석 보고서처럼 쓰지 마세요.',
      'summary는 코치가 경기 전체를 보고 내리는 첫 반응과 판결처럼 쓰세요. 객관적 원인만 나열하지 말고 캐릭터의 감정, 태도, 평가가 첫 문장부터 드러나야 합니다.',
      'coachStyle이 괄호 속마음을 요구하고 사용자의 경기가 부정확·실수·블런더 위주라면 summary에도 괄호 속마음을 최소 한 번 넣으세요. 정확한 수나 최선이 인상적이었다면 경계하거나 흥미를 느끼는 속마음을 사용할 수 있습니다.',
      '전체 문장은 자연스러운 한국어 구어체로 쓰세요. "하십시오", "삼으십시오", "바랍니다", "해야 합니다", "확인해야 할 경기입니다" 같은 보고서체와 훈계조 표현은 쓰지 마세요.',
      '겉말에 존댓말이 필요하면 "~했네요", "~해봐요", "~하는 게 좋아요", "~였죠"처럼 부드러운 대화체를 사용하세요.',
      'coachStyle이 괄호 속마음을 요구하면 괄호 안에서는 존댓말을 절대 쓰지 말고, 짧은 반말이나 혼잣말로 감정만 드러내세요. 괄호 안에서 체스 설명을 반복하지 마세요.',
      '입력에 근거한 잘한 점이 없으면 strengths는 빈 배열로 두세요. 의도만 있었다는 식의 억지 칭찬은 만들지 마세요.',
      'weaknesses는 "킹의 조기 노출" 같은 딱딱한 명사형 항목으로 쓰지 말고, 실제로 무엇을 놓쳤는지 캐릭터 말투가 담긴 짧은 완성 문장으로 쓰세요.',
      '추상적인 체스 원칙만 말하지 말고 가능한 경우 실제 SAN, 최선 대안, 평가 손실 또는 확인된 결과를 근거로 쓰세요.',
      'summary, weaknesses, goals, moments에서 같은 원인을 표현만 바꿔 반복하지 마세요. moments는 서로 다른 학습 장면만 고르세요.',
      'decisiveMove가 있으면 그 ply와 san을 moments에 반드시 포함하세요. 이 장면의 innerThought는 경기에서 가장 강하고 재미있는 반말 혼잣말이어야 하며 비워 두지 마세요.',
      '각 moment의 comment에는 체스 설명만 쓰고 괄호 속마음은 넣지 마세요. 속마음은 innerThought에 괄호 없이 짧은 반말로 따로 쓰세요. 속마음에 "요", "습니다", "세요" 같은 존댓말 어미를 쓰지 마세요.',
      'goals는 다음 판에서 바로 실행할 수 있는 짧은 행동으로 쓰고, 명령문보다 함께 복기하는 듯한 제안형 구어체를 사용하세요.',
      '아래 JSON 형식만 출력하세요:',
      '{"summary":"경기 총평 2~3문장","strengths":["잘한 점"],"weaknesses":["고칠 점"],"goals":["다음 경기 목표"],"moments":[{"ply":1,"san":"e4","title":"장면 제목","comment":"이 수에서 배울 점","innerThought":"짧은 반말 혼잣말"}]}',
      `경기 데이터: ${JSON.stringify(context)}`
    ].filter(Boolean).join('\n');
    const maxOutputTokens = Math.min(2048, Math.max(BASE_OUTPUT_TOKENS, 500 + moves.length * 180));
    return {prompt, model:MODEL, temperature:TEMPERATURE, maxOutputTokens};
  }

  function parseResponse(text, sourceMoves, playerColor){
    const normalizedPlayerColor = playerColor === 'b' ? 'b' : 'w';
    const moves = selectCriticalMoves(sourceMoves, normalizedPlayerColor);
    const decisiveMove = getDecisiveMove(moves, normalizedPlayerColor);
    const source = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    const candidates = [source, start >= 0 && end > start ? source.slice(start, end + 1) : ''];
    for (const candidate of candidates){
      try {
        const data = JSON.parse(candidate);
        const summary = normalizeParentheticalThoughts(data.summary);
        if (!summary) continue;
        const list = (value, limit) => Array.isArray(value)
          ? value.map(normalizeParentheticalThoughts).filter(Boolean).slice(0, limit)
          : [];
        const moments = Array.isArray(data.moments) ? data.moments.map((moment) => {
          const requestedPly = Number(moment?.ply);
          const san = shortText(moment?.san);
          let matchedMove = moves.find((move) => move.ply === requestedPly && move.san === san);
          if (!matchedMove && san){
            const sameSanMoves = moves.filter((move) => move.san === san);
            if (sameSanMoves.length === 1) matchedMove = sameSanMoves[0];
          }
          if (!matchedMove) return null;
          let comment = normalizeParentheticalThoughts(moment?.comment);
          let innerThought = normalizeInnerThought(moment?.innerThought);
          const legacyThought = comment.match(/\s*\(([^()]*)\)\s*$/);
          if (legacyThought){
            if (!innerThought) innerThought = normalizeInnerThought(legacyThought[1]);
            comment = comment.slice(0, legacyThought.index).trim();
          }
          return {
            ply:matchedMove.ply,
            san:matchedMove.san,
            title:shortText(moment?.title),
            comment,
            innerThought
          };
        }).filter((moment) => moment && moment.comment) : [];

        if (decisiveMove){
          let decisiveMoment = moments.find((moment) => moment.ply === decisiveMove.ply && moment.san === decisiveMove.san);
          if (!decisiveMoment){
            decisiveMoment = {
              ply:decisiveMove.ply,
              san:decisiveMove.san,
              title:'결정적인 실수',
              comment:decisiveMove.reasons[0] || (decisiveMove.alternative
                ? `${decisiveMove.san} 대신 ${decisiveMove.alternative}를 봤으면 좋았겠네요.`
                : `${decisiveMove.san}에서 가장 큰 손실을 허용했네요.`),
              innerThought:''
            };
            moments.push(decisiveMoment);
          }
          if (!decisiveMoment.innerThought){
            decisiveMoment.innerThought = '결국 가장 중요한 순간에 이걸 고르네. 기대를 접는 게 빠르겠어.';
          }
        }
        return {
          summary,
          strengths:list(data.strengths, 3),
          weaknesses:list(data.weaknesses, 3),
          goals:list(data.goals, 3),
          moments
        };
      } catch {
        // Try the JSON-shaped section when Gemini wraps its response.
      }
    }
    return null;
  }

  return {createRequest, getDecisiveMove, normalizeInnerThought, normalizeParentheticalThoughts, normalizeMoves, parseResponse, selectCriticalMoves};
});

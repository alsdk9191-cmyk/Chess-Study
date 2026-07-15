(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChessAIReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const MODEL = 'gemini-3.1-flash-lite';
  const TEMPERATURE = 1.0;
  const MAX_OUTPUT_TOKENS = 1000;
  const MAX_TEXT_LENGTH = 700;
  const MAX_REVIEW_MOVES = 160;

  function shortText(value){
    return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_LENGTH) : '';
  }

  function normalizeMoves(moves){
    return Array.isArray(moves) ? moves.slice(0, MAX_REVIEW_MOVES).map((move) => ({
      ply:Number(move?.ply),
      san:shortText(move?.san),
      color:shortText(move?.color),
      classification:shortText(move?.classification),
      deltaCp:Number.isFinite(move?.deltaCp) ? Math.round(move.deltaCp) : null,
      bestMove:shortText(move?.bestMove),
      reasons:Array.isArray(move?.reasons) ? move.reasons.map(shortText).filter(Boolean).slice(0, 2) : [],
      expected:shortText(move?.expected),
      alternative:shortText(move?.alternative)
    })).filter((move) => Number.isInteger(move.ply) && move.ply > 0 && move.san) : [];
  }

  function createRequest(options){
    const moves = normalizeMoves(options?.moves);
    if (!moves.length) throw new Error('리뷰할 기보가 없습니다.');
    const context = {
      playerColor:options?.playerColor === 'b' ? 'black' : 'white',
      result:shortText(options?.result),
      pgn:String(options?.pgn || '').trim().slice(0, 12000),
      moves,
      coachStyle:shortText(options?.coachStyle)
    };
    const prompt = [
      '당신은 한국어 체스 복기 코치입니다.',
      '한 수씩 재판정하지 말고 제공된 Stockfish 판정과 이유를 사실로 사용해 경기 전체의 흐름과 반복된 습관을 분석하세요.',
      '사용자 관점은 playerColor입니다. 상대의 실수보다 사용자가 배우고 재현할 내용에 집중하세요.',
      '핵심 장면은 최대 5개만 고르고 반드시 입력에 존재하는 ply와 san을 정확히 한 쌍으로 복사하세요.',
      '과장된 전술이나 입력에 없는 원인을 만들지 마세요.',
      '말투는 아래 coachStyle 지시를 가장 우선해서 따르세요.',
      context.coachStyle,
      '전체 문장은 자연스러운 한국어 구어체로 쓰세요. "하십시오", "삼으십시오", "바랍니다", "해야 합니다", "확인해야 할 경기입니다" 같은 보고서체와 훈계조 표현은 쓰지 마세요.',
      '겉말에 존댓말이 필요하면 "~했네요", "~해봐요", "~하는 게 좋아요", "~였죠"처럼 부드러운 대화체를 사용하세요.',
      'coachStyle이 괄호 속마음을 요구하면 괄호 안에서는 존댓말을 절대 쓰지 말고, 짧은 반말이나 혼잣말로 감정만 드러내세요. 괄호 안에서 체스 설명을 반복하지 마세요.',
      '입력에 근거한 잘한 점이 없으면 strengths는 빈 배열로 두세요. 의도만 있었다는 식의 억지 칭찬은 만들지 마세요.',
      '추상적인 체스 원칙만 말하지 말고 가능한 경우 실제 SAN, 최선 대안, 평가 손실 또는 확인된 결과를 근거로 쓰세요.',
      'summary, weaknesses, goals, moments에서 같은 원인을 표현만 바꿔 반복하지 마세요. moments는 서로 다른 학습 장면만 고르세요.',
      'goals는 다음 판에서 바로 실행할 수 있는 짧은 행동으로 쓰고, 명령문보다 함께 복기하는 듯한 제안형 구어체를 사용하세요.',
      '아래 JSON 형식만 출력하세요:',
      '{"summary":"경기 총평 2~3문장","strengths":["잘한 점"],"weaknesses":["고칠 점"],"goals":["다음 경기 목표"],"moments":[{"ply":1,"san":"e4","title":"장면 제목","comment":"이 수에서 배울 점"}]}',
      `경기 데이터: ${JSON.stringify(context)}`
    ].filter(Boolean).join('\n');
    return {prompt, model:MODEL, temperature:TEMPERATURE, maxOutputTokens:MAX_OUTPUT_TOKENS};
  }

  function parseResponse(text, sourceMoves){
    const moves = normalizeMoves(sourceMoves);
    const source = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    const candidates = [source, start >= 0 && end > start ? source.slice(start, end + 1) : ''];
    for (const candidate of candidates){
      try {
        const data = JSON.parse(candidate);
        const summary = shortText(data.summary);
        if (!summary) continue;
        const list = (value, limit) => Array.isArray(value) ? value.map(shortText).filter(Boolean).slice(0, limit) : [];
        const moments = Array.isArray(data.moments) ? data.moments.map((moment) => {
          const requestedPly = Number(moment?.ply);
          const san = shortText(moment?.san);
          let matchedMove = moves.find((move) => move.ply === requestedPly && move.san === san);
          if (!matchedMove && san){
            const sameSanMoves = moves.filter((move) => move.san === san);
            if (sameSanMoves.length === 1) matchedMove = sameSanMoves[0];
          }
          if (!matchedMove) return null;
          return {
            ply:matchedMove.ply,
            san:matchedMove.san,
            title:shortText(moment?.title),
            comment:shortText(moment?.comment)
          };
        }).filter((moment) => moment && moment.comment).slice(0, 5) : [];
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

  return {createRequest, normalizeMoves, parseResponse};
});

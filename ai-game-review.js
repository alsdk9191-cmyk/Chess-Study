(function(root, factory){
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ChessAIReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const MODEL = 'gemini-2.5-flash-lite';
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
      context.coachStyle,
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

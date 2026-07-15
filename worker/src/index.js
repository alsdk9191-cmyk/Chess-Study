const MAX_TEXT_LENGTH = 700;
const MAX_REVIEW_MOVES = 160;

function json(body, status, headers){
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type':'application/json; charset=UTF-8', ...headers}
  });
}

function corsHeaders(request, env){
  const origin = request.headers.get('Origin') || '';
  if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return null;
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

function shortText(value){
  return typeof value === 'string' ? value.trim().slice(0, MAX_TEXT_LENGTH) : '';
}

function parseModelJson(text){
  const source = String(text || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const candidates = [source];
  const objectStart = source.indexOf('{');
  const objectEnd = source.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(source.slice(objectStart, objectEnd + 1));

  for (const candidate of candidates){
    try {
      const data = JSON.parse(candidate);
      const lines = Array.isArray(data.body) ? data.body : [data.body];
      const body = lines.map(shortText).filter(Boolean).slice(0, 2);
      if (body.length) return {body};
    } catch {
      // Try the next JSON-shaped section, then fall back to plain text.
    }
  }

  const body = source
    .split(/\n+|(?<=[.!?])\s+/)
    .map(shortText)
    .filter(Boolean)
    .slice(0, 2);
  return body.length ? {body} : null;
}

function parseGameReviewJson(text){
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
      const moments = Array.isArray(data.moments) ? data.moments.map((moment) => ({
        ply:Number(moment?.ply),
        title:shortText(moment?.title),
        comment:shortText(moment?.comment)
      })).filter((moment) => Number.isInteger(moment.ply) && moment.ply > 0 && moment.comment).slice(0, 5) : [];
      return {summary, strengths:list(data.strengths, 3), weaknesses:list(data.weaknesses, 3), goals:list(data.goals, 3), moments};
    } catch {
      // Try the JSON-shaped section when the model wraps its response.
    }
  }
  return null;
}

export default {
  async fetch(request, env){
    const cors = corsHeaders(request, env);
    if (!cors) return json({error:'허용되지 않은 요청입니다.'}, 403, {});
    if (request.method === 'OPTIONS') return new Response(null, {headers:cors});
    if (request.method !== 'POST') return json({error:'POST 요청만 지원합니다.'}, 405, cors);
    if (!env.GEMINI_API_KEY) return json({error:'Gemini 키가 설정되지 않았습니다.'}, 500, cors);

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json({error:'잘못된 요청입니다.'}, 400, cors);
    }

    const isGameReview = payload.mode === 'gameReview';
    if (isGameReview){
      const moves = Array.isArray(payload.moves) ? payload.moves.slice(0, MAX_REVIEW_MOVES).map((move) => ({
        ply:Number(move?.ply), san:shortText(move?.san), color:shortText(move?.color),
        classification:shortText(move?.classification), deltaCp:Number.isFinite(move?.deltaCp) ? Math.round(move.deltaCp) : null,
        bestMove:shortText(move?.bestMove), reasons:Array.isArray(move?.reasons) ? move.reasons.map(shortText).filter(Boolean).slice(0, 2) : [],
        expected:shortText(move?.expected), alternative:shortText(move?.alternative)
      })).filter((move) => Number.isInteger(move.ply) && move.san) : [];
      if (!moves.length) return json({error:'리뷰할 기보가 없습니다.'}, 400, cors);
      const reviewContext = {
        playerColor:payload.playerColor === 'b' ? 'black' : 'white',
        result:shortText(payload.result),
        pgn:String(payload.pgn || '').trim().slice(0, 12000),
        moves,
        coachStyle:shortText(payload.coachStyle)
      };
      const reviewPrompt = [
        '당신은 한국어 체스 복기 코치입니다.',
        '한 수씩 재판정하지 말고 제공된 Stockfish 판정과 이유를 사실로 사용해 경기 전체의 흐름과 반복된 습관을 분석하세요.',
        '사용자 관점은 playerColor입니다. 상대의 실수보다 사용자가 배우고 재현할 내용에 집중하세요.',
        '핵심 장면은 최대 5개만 고르고 반드시 입력에 존재하는 ply를 사용하세요.',
        '과장된 전술이나 입력에 없는 원인을 만들지 마세요.',
        reviewContext.coachStyle,
        '아래 JSON 형식만 출력하세요:',
        '{"summary":"경기 총평 2~3문장","strengths":["잘한 점"],"weaknesses":["고칠 점"],"goals":["다음 경기 목표"],"moments":[{"ply":1,"title":"장면 제목","comment":"이 수에서 배울 점"}]}',
        `경기 데이터: ${JSON.stringify(reviewContext)}`
      ].join('\n');
      return generateGeminiResponse(env, cors, reviewPrompt, parseGameReviewJson, 1000);
    }

    const stockfishReason = Array.isArray(payload.stockfishReason)
      ? payload.stockfishReason.map(shortText).filter(Boolean).slice(0, 2)
      : [];
    if (!shortText(payload.classification) || !shortText(payload.move)){
      return json({error:'해설 정보가 부족합니다.'}, 400, cors);
    }

    const rawFacts = payload.facts && typeof payload.facts === 'object' ? payload.facts : {};
    const context = {
      move: shortText(payload.move),
      side: shortText(payload.color),
      classification: shortText(payload.classification),
      evaluation: shortText(payload.evaluation),
      stockfishReason,
      verifiedFacts: {
        rule: shortText(rawFacts.rule),
        deltaCp: Number.isFinite(rawFacts.deltaCp) ? Math.round(rawFacts.deltaCp) : null,
        materialLoss: Number.isFinite(rawFacts.materialLoss) ? rawFacts.materialLoss : 0,
        mateAgainstMover: rawFacts.mateAgainstMover === true,
        tactic: rawFacts.verifiedTactic && typeof rawFacts.verifiedTactic === 'object'
          ? shortText(JSON.stringify(rawFacts.verifiedTactic))
          : ''
      },
      expected: shortText(payload.expected),
      alternative: shortText(payload.alternative),
      coachStyle: shortText(payload.coachStyle)
    };
    const prompt = [
      '당신은 한국어 체스 코치입니다.',
      'verifiedFacts와 stockfishReason에 있는 사실만 짧게 풀어 쓰세요.',
      'verifiedFacts에 없는 전술, 포크, 기물 손실, 강제 수순을 새로 추측하지 마세요.',
      '평가 라벨은 UI에 이미 표시됩니다. 본문에는 수 이름이나 판정명을 다시 쓰지 마세요.',
      '반드시 서로 역할이 다른 두 문장을 작성하세요.',
      '첫 문장: stockfishReason의 핵심 결과를 까칠하고 재치 있게 해석하세요.',
      '둘째 문장: alternative 또는 확인된 학습 포인트를 이용해 다음에 볼 행동을 알려 주세요.',
      '"실수입니다", "블런더입니다", "좋은 수입니다" 같은 판정 반복은 해설로 인정하지 않습니다.',
      '같은 표현을 습관적으로 반복하지 말고, 상황에 맞는 비유나 짧은 빈정거림을 매번 새로 만드세요.',
      context.coachStyle || '살짝 빈정대고 재치 있게 꼬집되, 욕설·비하·인신공격은 하지 마세요.',
      '초급자가 바로 이해할 수 있는 짧은 문장만 작성하세요.',
      'JSON, 코드 블록, 인삿말 없이 한국어 해설 1~2문장만 출력하세요.',
      '각 문장은 80자 이하여야 합니다.',
      `분석 데이터: ${JSON.stringify(context)}`
    ].join('\n');

    return generateGeminiResponse(env, cors, prompt, parseModelJson, 180);
  }
};

async function generateGeminiResponse(env, cors, prompt, parser, maxOutputTokens){
    const model = env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    let geminiResponse;
    try {
      geminiResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{parts: [{text: prompt}]}],
          generationConfig: {temperature: 1.0, maxOutputTokens}
        })
      });
    } catch (error) {
      const detail = shortText(error?.message) || 'Gemini request could not be sent.';
      console.error(JSON.stringify({
        event: 'gemini_fetch_error',
        detail
      }));
      return json({error: detail}, 502, cors);
    }

    if (!geminiResponse.ok) {
      let detail = '';
      try {
        const errorData = await geminiResponse.json();
        detail = shortText(errorData?.error?.message);
      } catch {
        // Preserve a useful generic message when Gemini returns a non-JSON error.
      }
      console.error(JSON.stringify({
        event: 'gemini_api_error',
        status: geminiResponse.status,
        detail: detail || 'Gemini returned an empty error response.'
      }));
      return json({error: detail || 'Gemini 해설을 만들지 못했습니다.'}, 502, cors);
    }
    const geminiData = await geminiResponse.json();
    const text = geminiData.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('');
    const result = parser(text);
    if (!result) return json({error:'Gemini 응답 형식이 올바르지 않습니다.'}, 502, cors);
    return json(result, 200, cors);
}

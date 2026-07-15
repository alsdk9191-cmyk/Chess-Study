const MAX_TEXT_LENGTH = 700;

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
  try {
    const data = JSON.parse(source);
    if (!Array.isArray(data.body)) return null;
    const body = data.body
      .map(shortText)
      .filter(Boolean)
      .slice(0, 2);
    return body.length ? {body} : null;
  } catch {
    return null;
  }
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

    const stockfishReason = Array.isArray(payload.stockfishReason)
      ? payload.stockfishReason.map(shortText).filter(Boolean).slice(0, 2)
      : [];
    if (!shortText(payload.classification) || !shortText(payload.move)){
      return json({error:'해설 정보가 부족합니다.'}, 400, cors);
    }

    const context = {
      move: shortText(payload.move),
      side: shortText(payload.color),
      classification: shortText(payload.classification),
      evaluation: shortText(payload.evaluation),
      stockfishReason,
      expected: shortText(payload.expected),
      alternative: shortText(payload.alternative),
      coachStyle: shortText(payload.coachStyle)
    };
    const prompt = [
      '당신은 한국어 체스 코치입니다.',
      'Stockfish가 제공한 사실만 사용하고, 없는 전술이나 기물 손실을 추측하지 마세요.',
      '평가 라벨을 바꾸지 말고 기보 표기를 제목처럼 반복하지 마세요.',
      context.coachStyle || '직설적이되 예의 있는 체스 코치 말투를 쓰세요.',
      '초급자가 바로 이해할 수 있는 짧은 문장만 작성하세요.',
      '반드시 JSON만 반환하세요: {"body":["핵심 이유", "짧은 학습 포인트"]}.',
      'body는 1~2문장이고 각 문장은 80자 이하여야 합니다.',
      `분석 데이터: ${JSON.stringify(context)}`
    ].join('\n');

    const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
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
          generationConfig: {temperature: 0.2, maxOutputTokens: 180, responseMimeType: 'application/json'}
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
    const result = parseModelJson(text);
    if (!result) return json({error:'Gemini 응답 형식이 올바르지 않습니다.'}, 502, cors);
    return json(result, 200, cors);
  }
};

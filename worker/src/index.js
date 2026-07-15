const MAX_PROMPT_LENGTH = 120000;

function json(body, status, headers){
  return new Response(JSON.stringify(body), {
    status,
    headers:{'Content-Type':'application/json; charset=UTF-8', ...headers}
  });
}

function corsHeaders(request, env){
  const origin = request.headers.get('Origin') || '';
  if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) return null;
  return {
    'Access-Control-Allow-Origin':env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
    'Vary':'Origin'
  };
}

function safeModel(value){
  const model = typeof value === 'string' ? value.trim() : '';
  return /^[a-zA-Z0-9._-]{1,80}$/.test(model) ? model : 'gemini-2.5-flash-lite';
}

function clampNumber(value, minimum, maximum, fallback){
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
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

    const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : '';
    if (!prompt || prompt.length > MAX_PROMPT_LENGTH){
      return json({error:'프롬프트가 비어 있거나 너무 깁니다.'}, 400, cors);
    }

    const model = safeModel(payload.model);
    const temperature = clampNumber(payload.temperature, 0, 2, 1);
    const maxOutputTokens = Math.round(clampNumber(payload.maxOutputTokens, 64, 2048, 1000));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    let geminiResponse;
    try {
      geminiResponse = await fetch(url, {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-goog-api-key':env.GEMINI_API_KEY
        },
        body:JSON.stringify({
          contents:[{parts:[{text:prompt}]}],
          generationConfig:{temperature, maxOutputTokens}
        })
      });
    } catch (error) {
      const detail = String(error?.message || 'Gemini request could not be sent.').slice(0, 700);
      console.error(JSON.stringify({event:'gemini_fetch_error', detail}));
      return json({error:detail}, 502, cors);
    }

    if (!geminiResponse.ok){
      let detail = '';
      try {
        const errorData = await geminiResponse.json();
        detail = String(errorData?.error?.message || '').trim().slice(0, 700);
      } catch {
        // Keep a useful generic message for non-JSON API errors.
      }
      console.error(JSON.stringify({event:'gemini_api_error', status:geminiResponse.status, detail}));
      return json({error:detail || 'Gemini 응답을 받지 못했습니다.'}, 502, cors);
    }

    const geminiData = await geminiResponse.json();
    const text = geminiData.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();
    if (!text) return json({error:'Gemini 응답이 비어 있습니다.'}, 502, cors);
    const modelVersion = typeof geminiData.modelVersion === 'string' && geminiData.modelVersion.trim()
      ? geminiData.modelVersion.trim()
      : model;
    return json({text, model:modelVersion}, 200, cors);
  }
};

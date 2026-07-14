# Gemini Worker Setup

The Gemini API key must never be placed in `index.html` or committed to GitHub.

1. Create a Cloudflare account, open **Workers & Pages**, and create a Worker from this repository. Set the Worker root directory to `worker`.
2. In the Worker's **Settings > Variables and Secrets**, add these production values:
   - Secret: `GEMINI_API_KEY` = Gemini API key
   - Variable: `ALLOWED_ORIGIN` = the GitHub Pages origin only, for example `https://your-github-name.github.io`
   - Optional variable: `GEMINI_MODEL` = `gemini-2.5-flash`
3. Deploy the Worker. Copy its `https://...workers.dev` address.
4. Open the chess site. Under **AI 해설**, paste the Worker address and enable **Gemini 사용**. This is saved only in this browser.

The site keeps Stockfish as the source of move evaluation. Gemini only rewrites the confirmed Stockfish explanation in concise Korean. If the Worker or Gemini is unavailable, the Stockfish explanation remains visible.

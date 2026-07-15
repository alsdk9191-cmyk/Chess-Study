# Gemini Worker Setup

The Gemini API key must never be placed in `index.html` or committed to GitHub.

1. Create a Cloudflare account, open **Workers & Pages**, and create a Worker from this repository. Set the Worker root directory to `worker`.
2. In the Worker's **Settings > Variables and Secrets**, add these production values:
   - Secret: `GEMINI_API_KEY` = Gemini API key
   - Variable: `ALLOWED_ORIGIN` = the GitHub Pages origin only, for example `https://your-github-name.github.io`
3. Deploy the Worker. Copy its `https://...workers.dev` address.
4. Set the Worker address in `ai-coach-config.js` and deploy the GitHub Pages site.

The Worker only protects the API key, validates the allowed origin, and forwards requests to Gemini. Prompts, model selection, response parsing, and review behavior live in `ai-game-review.js`, so future AI review changes require only a GitHub Pages deployment.

# financial_analyst

AI-powered financial analyses — individual and team. Built for a small-team presentation.

See the open PR for the **FinSync** app: a single-page tool with three tabs:

- **Individual Analysis** — live Financial Health Score (0–100) + Claude-grounded insights and projections
- **Team Budget** — proportional income-based splits for shared expenses (the differentiator vs a generic ChatGPT prompt)
- **Scenario Battle** — head-to-head 6mo / 1yr / 3yr projections with a winner, risk levels, and a wildcard

The app works in three AI modes (auto-detected):

1. **Artifact mode** — when embedded in a Claude.ai artifact, uses `window.claude.complete`
2. **Direct API mode** — paste an Anthropic API key; FinSync calls the Messages API from the browser
3. **Demo mode** — no key required; deterministic heuristics grounded in the same inputs (great for a live presentation without an internet round-trip)

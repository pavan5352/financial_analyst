# FinSync Frontend (MVP)

This folder contains a frontend-first prototype for your AI-powered financial analysis demo:

- Individual Analysis panel with deterministic Financial Health Score
- Value Builder Playbook with live leverage indicators + AI value-plan generation
- Individual Stock Fit Scorecards (budget + risk-aware)
- Scenario Lab that turns natural-language questions into instant calculators
- Team Budget panel with company-cost planning, AI line-item assignment, and edit-then-calculate workflow
- API-ready integration points for AI-generated explanations and suggestions

## Run

Open `index.html` directly in a browser.

If you use VS Code, the Live Server extension is the easiest option for local testing.

## Financial Health Score Formula

The score is calculated client-side (0-100) using weighted components:

- Savings Rate: `monthly_savings / monthly_income`
- Debt-to-Income: `monthly_debt_payment / monthly_income`
- Emergency Runway: `emergency_fund / essential_monthly_outflow`
- Discretionary Burn: `discretionary_spend / monthly_income`

Weights:

- Savings rate: 32%
- Debt-to-income: 24%
- Emergency runway: 26%
- Discretionary burn: 18%

## Team Company Budget Model

Per member:

- `effective_cost = base_cost * (allocation_percent / 100)`
- `accountability_factor = (accountability_percent / 100) * (outcome_percent / 100)`

Then:

- `core_budget = sum(effective_cost) + sum(final_budget_line_items)`
- `delivery_readiness = weighted(accountability, outcome)`
- `accountability_reserve = core_budget * reserve_multiplier * (1.15 - delivery_readiness)`
- `total_company_budget = core_budget + accountability_reserve`

Affordability guardrail:

- Variance tracking per line item: `variance = final_budget - ai_projected`

## AI Backend Contract (Frontend Expectation)

Set your endpoint and optional API key from the in-app **AI Endpoint Settings** panel.

Frontend sends:

```json
{
  "task": "individual-analysis | value-plan | stock-scorecards | calculator-builder | team-budget-assignment",
  "model": "optional-model-name",
  "payload": { "context": "task-specific data" }
}
```

### 1. `task = "individual-analysis"`

Expected response:

```json
{
  "summary": "text",
  "insightPills": [
    { "tone": "good|warning|danger|neutral", "label": "text" }
  ],
  "topAction": "text",
  "projection": { "m6": 1000, "y1": 2400, "y3": 8000 }
}
```

### 2. `task = "value-plan"`

Expected response:

```json
{
  "overview": "text",
  "focusAreas": [{ "tone": "good|warning|danger|neutral", "label": "text" }],
  "priorityActions": ["step 1", "step 2", "step 3"],
  "checkpoints": { "m1": "text", "m3": "text", "m6": "text" },
  "guardrails": ["rule 1", "rule 2"]
}
```

### 3. `task = "stock-scorecards"`

Expected response:

```json
{
  "scores": [
    {
      "ticker": "MSFT",
      "fitScore": 82,
      "riskLabel": "balanced",
      "subscores": {
        "valuation": 70,
        "profitability": 90,
        "cashflow": 87,
        "volatility": 65,
        "liquidity": 92
      },
      "rationale": "text",
      "caution": "text",
      "allocationHint": "text"
    }
  ]
}
```

### 4. `task = "calculator-builder"`

Expected response:

```json
{
  "guidance": "text",
  "calculator": {
    "title": "Calculator Name",
    "description": "text",
    "assumptions": ["line 1", "line 2"],
    "inputs": [
      {
        "id": "monthly_budget",
        "label": "Monthly Budget",
        "type": "number",
        "defaultValue": 500,
        "min": 0,
        "max": 5000,
        "step": 10,
        "unit": "USD"
      }
    ],
    "outputs": [
      {
        "id": "budget_load",
        "label": "Budget Load",
        "formula": "scenario_cost / monthly_budget",
        "format": "percent",
        "decimals": 1
      }
    ]
  }
}
```

Formula note:

- Keep formulas arithmetic-only (numbers, variable ids, `+ - * / ( )`, and helper functions `min max abs pow round`).
- Output IDs can be reused in later formulas, allowing chained calculations.

### 5. `task = "team-budget-assignment"`

Expected response:

```json
{
  "lineItems": [
    { "id": "vendor_coordination", "label": "Vendor Coordination", "projected": 540 }
  ],
  "rationale": "text",
  "opportunities": ["tip 1", "tip 2", "tip 3"],
  "warnings": ["warning text"]
}
```

## Notes

- If endpoint is empty or **Use mock AI responses** is enabled, the UI uses local mock responses.
- Do not keep real API keys in production browser local storage. For production, proxy through your backend.

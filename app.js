const SETTINGS_KEY = "finsync_settings_v1";
const SCORE_WEIGHTS = {
  savingsRate: 0.32,
  debtToIncome: 0.24,
  runway: 0.26,
  discretionaryBurn: 0.18,
};

const TEAM_TYPE_CONFIGS = {
  outsourced: {
    toolName: "Outsourced Contracts Budget Console",
    description:
      "Budget the company cost of outsourced contracts with accountability reserves linked to delivery outcomes.",
    baseLabel: "Contract Cost (Monthly)",
    allocationLabel: "Engagement %",
    accountabilityLabel: "SLA Accountability %",
    outcomeLabel: "Outcome Delivery %",
    budgetTitle: "Projected Company Budget Table",
    budgetNote:
      "AI projects outsourced team line-items. Edit final values if required, then calculate total accountable company budget.",
    reserveMultiplier: 0.14,
    lineItems: [
      { id: "vendor_coordination", label: "Vendor Coordination", defaultValue: 520 },
      { id: "qa_compliance", label: "QA / Compliance", defaultValue: 420 },
      { id: "communication_ops", label: "Communication Ops", defaultValue: 320 },
      { id: "tools_licenses", label: "Tools / Licenses", defaultValue: 360 },
      { id: "contingency", label: "Contingency", defaultValue: 280 },
    ],
  },
  internal_temp: {
    toolName: "Internal Taskforce Cost Console",
    description:
      "Budget temporary internal congregation costs, ownership commitments, and execution buffers tied to problem resolution.",
    baseLabel: "Internal Cost (Monthly)",
    allocationLabel: "Allocation %",
    accountabilityLabel: "Ownership Accountability %",
    outcomeLabel: "Problem Resolution %",
    budgetTitle: "Projected Internal Team Budget Table",
    budgetNote:
      "AI projects temporary internal team line-items. Edit final values if required, then calculate total accountable company budget.",
    reserveMultiplier: 0.1,
    lineItems: [
      { id: "internal_enablement", label: "Internal Enablement", defaultValue: 460 },
      { id: "cross_function_sync", label: "Cross-Function Sync", defaultValue: 300 },
      { id: "workshop_execution", label: "Workshop Execution", defaultValue: 280 },
      { id: "travel_logistics", label: "Travel / Logistics", defaultValue: 240 },
      { id: "contingency", label: "Contingency", defaultValue: 220 },
    ],
  },
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;
const formatNumber = (value, decimals = 2) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

let activeTeamType = "outsourced";
let budgetEditingEnabled = false;

function switchTabs() {
  const buttons = document.querySelectorAll(".tab-button");
  const tabs = document.querySelectorAll(".tab-content");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      tabs.forEach((tab) => tab.classList.remove("active"));

      button.classList.add("active");
      const selected = document.getElementById(button.dataset.tab);
      if (selected) {
        selected.classList.add("active");
      }
    });
  });
}

function initializeStockCollapsible() {
  const panel = document.getElementById("stock-scorecard-panel");
  const label = document.getElementById("stock-panel-toggle-label");
  if (!panel || !label) {
    return;
  }

  const syncLabel = () => {
    label.textContent = panel.open ? "Collapse" : "Expand";
    label.className = `pill ${panel.open ? "warning" : "neutral"}`;
  };

  panel.addEventListener("toggle", syncLabel);
  syncLabel();
}

function collectIndividualValues() {
  const income = toNumber(document.getElementById("income").value);
  const housing = toNumber(document.getElementById("housing").value);
  const utilities = toNumber(document.getElementById("utilities").value);
  const groceries = toNumber(document.getElementById("groceries").value);
  const transport = toNumber(document.getElementById("transport").value);
  const healthcare = toNumber(document.getElementById("healthcare").value);
  const lifestyle = toNumber(document.getElementById("lifestyle").value);
  const savings = toNumber(document.getElementById("savings").value);
  const debtPayment = toNumber(document.getElementById("debt-payment").value);
  const emergencyFund = toNumber(document.getElementById("emergency-fund").value);

  const totalExpenses = housing + utilities + groceries + transport + healthcare + lifestyle;
  const essentialOutflow = housing + utilities + groceries + transport + healthcare + debtPayment;
  const disposable = Math.max(0, income - totalExpenses - debtPayment);
  const investBudgetInput = document.getElementById("invest-budget");

  if (investBudgetInput && (!investBudgetInput.value || Number(investBudgetInput.value) === 0)) {
    const suggestedInvestBudget = Math.floor(disposable * 0.5);
    investBudgetInput.value = String(Math.max(0, suggestedInvestBudget));
  }

  return {
    income,
    expenses: {
      housing,
      utilities,
      groceries,
      transport,
      healthcare,
      lifestyle,
    },
    savings,
    debtPayment,
    emergencyFund,
    totalExpenses,
    essentialOutflow,
    discretionaryExpense: lifestyle,
    disposable,
  };
}

function computeHealthMetrics(input) {
  const savingsRate = input.income > 0 ? input.savings / input.income : 0;
  const debtToIncome = input.income > 0 ? input.debtPayment / input.income : 0;
  const runwayMonths = input.essentialOutflow > 0 ? input.emergencyFund / input.essentialOutflow : 0;
  const discretionaryBurn = input.income > 0 ? input.discretionaryExpense / input.income : 0;

  const savingsScore = clamp(savingsRate / 0.3);
  const debtScore = 1 - clamp(debtToIncome / 0.4);
  const runwayScore = clamp(runwayMonths / 6);
  const discretionaryScore = 1 - clamp((discretionaryBurn - 0.1) / 0.25);

  const healthScore =
    (savingsScore * SCORE_WEIGHTS.savingsRate +
      debtScore * SCORE_WEIGHTS.debtToIncome +
      runwayScore * SCORE_WEIGHTS.runway +
      discretionaryScore * SCORE_WEIGHTS.discretionaryBurn) *
    100;

  return {
    savingsRate,
    debtToIncome,
    runwayMonths,
    discretionaryBurn,
    savingsScore,
    debtScore,
    runwayScore,
    discretionaryScore,
    healthScore: Math.round(clamp(healthScore / 100) * 100),
  };
}

function getHealthBand(score) {
  if (score >= 80) {
    return { label: "Strong position", css: "good" };
  }
  if (score >= 60) {
    return { label: "Stable but improvable", css: "warning" };
  }
  return { label: "Needs attention", css: "danger" };
}

function renderIndividualMetrics(metrics) {
  const scoreNode = document.getElementById("health-score");
  const healthBandNode = document.getElementById("health-band");
  const band = getHealthBand(metrics.healthScore);

  scoreNode.textContent = String(metrics.healthScore);
  healthBandNode.textContent = band.label;
  healthBandNode.className = `pill ${band.css}`;

  document.getElementById("metric-savings-rate").textContent = formatPercent(metrics.savingsRate);
  document.getElementById("metric-dti").textContent = formatPercent(metrics.debtToIncome);
  document.getElementById("metric-runway").textContent = `${metrics.runwayMonths.toFixed(1)} mo`;
  document.getElementById("metric-burn").textContent = formatPercent(metrics.discretionaryBurn);
}

function loadSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      endpoint: parsed.endpoint || "",
      model: parsed.model || "",
      apiKey: parsed.apiKey || "",
      useMock: parsed.useMock ?? true,
    };
  } catch (_err) {
    return { endpoint: "", model: "", apiKey: "", useMock: true };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function initializeSettingsUI() {
  const settings = loadSettings();
  const form = document.getElementById("settings-form");
  const endpointInput = document.getElementById("api-endpoint");
  const modelInput = document.getElementById("api-model");
  const keyInput = document.getElementById("api-key");
  const useMockInput = document.getElementById("use-mock-ai");
  const statusNode = document.getElementById("settings-status");

  endpointInput.value = settings.endpoint;
  modelInput.value = settings.model;
  keyInput.value = settings.apiKey;
  useMockInput.checked = settings.useMock;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const updatedSettings = {
      endpoint: endpointInput.value.trim(),
      model: modelInput.value.trim(),
      apiKey: keyInput.value.trim(),
      useMock: useMockInput.checked,
    };
    saveSettings(updatedSettings);
    statusNode.textContent = "Saved. All future AI calls will use this configuration.";
  });
}

function setLoading(node, isLoading) {
  if (isLoading) {
    node.classList.add("loading");
  } else {
    node.classList.remove("loading");
  }
}

function asFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeId(value, fallback = "field") {
  const safe = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || fallback;
}

function normalizeStringList(value, fallback = []) {
  if (!Array.isArray(value)) {
    return fallback;
  }
  const cleaned = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : fallback;
}

function safeEvaluateFormula(formula, scope) {
  if (typeof formula !== "string" || formula.length === 0 || formula.length > 240) {
    return NaN;
  }

  const allowedChars = /^[0-9a-zA-Z_+\-*/().,\s]*$/;
  if (!allowedChars.test(formula)) {
    return NaN;
  }

  const identifiers = formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  const scopeKeys = Object.keys(scope);
  const allowedFns = new Set(["min", "max", "abs", "pow", "round"]);
  for (const token of identifiers) {
    if (!scopeKeys.includes(token) && !allowedFns.has(token)) {
      return NaN;
    }
  }

  const argNames = [...scopeKeys, "min", "max", "abs", "pow", "round"];
  const argValues = [...Object.values(scope), Math.min, Math.max, Math.abs, Math.pow, Math.round];

  try {
    const evaluator = new Function(...argNames, `"use strict"; return (${formula});`);
    const result = evaluator(...argValues);
    return Number.isFinite(result) ? result : NaN;
  } catch (_error) {
    return NaN;
  }
}

function formatCalculatedOutput(value, outputDef) {
  if (!Number.isFinite(value)) {
    return "N/A";
  }

  const decimals = Number.isInteger(outputDef?.decimals) ? outputDef.decimals : 2;
  const format = outputDef?.format || "number";
  if (format === "currency") {
    return formatCurrency(value);
  }
  if (format === "percent") {
    const baseValue = outputDef?.percentScale === "raw" ? value : value * 100;
    return `${baseValue.toFixed(Math.max(0, decimals))}%`;
  }
  return formatNumber(value, Math.max(0, decimals));
}

function buildFallbackCalculatorSpec(question, context = {}) {
  const lower = String(question || "").toLowerCase();
  if (/(loan|debt|emi|prepay|interest)/.test(lower)) {
    return {
      title: "Loan Prepay vs Invest Calculator",
      description: "Compare simple impact of prepaying debt versus investing the same monthly amount.",
      assumptions: [
        "Uses directional planning math, not exact amortization schedules.",
        "Investment growth uses linearized return assumption for simplicity.",
      ],
      inputs: [
        { id: "loan_balance", label: "Loan Balance", type: "number", defaultValue: 20000, min: 0, step: 100, unit: "USD" },
        { id: "loan_rate", label: "Loan Rate (%)", type: "number", defaultValue: 7.2, min: 0, step: 0.1 },
        { id: "monthly_extra", label: "Extra Monthly Amount", type: "number", defaultValue: context.budgetAnchor || 500, min: 0, step: 10, unit: "USD" },
        { id: "invest_return", label: "Expected Annual Invest Return (%)", type: "number", defaultValue: 11, min: 0, step: 0.1 },
        { id: "horizon_months", label: "Horizon (months)", type: "number", defaultValue: context.horizonMonths || 36, min: 1, step: 1 },
      ],
      outputs: [
        { id: "annual_interest_cost", label: "Current Annual Interest Cost", formula: "loan_balance * (loan_rate / 100)", format: "currency", decimals: 0 },
        { id: "prepay_benefit", label: "Estimated Prepay Benefit", formula: "monthly_extra * horizon_months * (loan_rate / 1200)", format: "currency", decimals: 0 },
        { id: "invest_value", label: "Estimated Invest Value", formula: "monthly_extra * horizon_months + (monthly_extra * horizon_months * (invest_return / 100) * (horizon_months / 24))", format: "currency", decimals: 0 },
        { id: "net_edge", label: "Invest Minus Prepay (Directional)", formula: "invest_value - prepay_benefit", format: "currency", decimals: 0 },
      ],
    };
  }

  if (/(goal|save|saving|emergency|fund)/.test(lower)) {
    return {
      title: "Savings Goal Feasibility Calculator",
      description: "Estimate whether current contribution pace reaches your target in time.",
      assumptions: [
        "Returns assume consistent monthly contributions.",
        "No taxes, fees, or major one-time withdrawals are included.",
      ],
      inputs: [
        { id: "goal_amount", label: "Goal Amount", type: "number", defaultValue: 15000, min: 0, step: 100, unit: "USD" },
        { id: "current_savings", label: "Current Savings", type: "number", defaultValue: 3500, min: 0, step: 100, unit: "USD" },
        { id: "monthly_contribution", label: "Monthly Contribution", type: "number", defaultValue: context.budgetAnchor || 500, min: 0, step: 10, unit: "USD" },
        { id: "annual_return", label: "Expected Annual Return (%)", type: "number", defaultValue: 6.5, min: 0, step: 0.1 },
        { id: "goal_months", label: "Goal Timeline (months)", type: "number", defaultValue: context.horizonMonths || 24, min: 1, step: 1 },
      ],
      outputs: [
        { id: "projected_balance", label: "Projected Balance", formula: "current_savings + monthly_contribution * goal_months + ((current_savings + monthly_contribution * goal_months * 0.5) * (annual_return / 100) * (goal_months / 12))", format: "currency", decimals: 0 },
        { id: "goal_gap", label: "Gap to Goal (negative means surplus)", formula: "goal_amount - projected_balance", format: "currency", decimals: 0 },
        { id: "required_monthly", label: "Required Monthly Contribution", formula: "(goal_amount - current_savings) / goal_months", format: "currency", decimals: 0 },
        { id: "goal_coverage", label: "Goal Coverage Ratio", formula: "projected_balance / goal_amount", format: "percent", decimals: 1 },
      ],
    };
  }

  if (/(team|trip|shared|group|event|split)/.test(lower)) {
    return {
      title: "Shared Cost Fair Split Calculator",
      description: "Estimate fair share versus equal share based on your financial capacity.",
      assumptions: [
        "Capacity-based allocation is directional and should be validated with the team.",
        "Affordability ratio above 35% is usually a risk flag.",
      ],
      inputs: [
        { id: "total_cost", label: "Total Shared Cost", type: "number", defaultValue: 1800, min: 0, step: 10, unit: "USD" },
        { id: "member_count", label: "Number of Members", type: "number", defaultValue: 4, min: 1, step: 1 },
        { id: "your_capacity", label: "Your Monthly Capacity", type: "number", defaultValue: context.budgetAnchor || 700, min: 1, step: 10, unit: "USD" },
        { id: "avg_capacity", label: "Average Team Capacity", type: "number", defaultValue: 900, min: 1, step: 10, unit: "USD" },
      ],
      outputs: [
        { id: "equal_split", label: "Equal Split", formula: "total_cost / member_count", format: "currency", decimals: 0 },
        { id: "fair_share", label: "Capacity-Based Fair Share", formula: "total_cost * (your_capacity / (avg_capacity * member_count))", format: "currency", decimals: 0 },
        { id: "savings_vs_equal", label: "Difference vs Equal Split", formula: "equal_split - fair_share", format: "currency", decimals: 0 },
        { id: "affordability_ratio", label: "Affordability Ratio", formula: "fair_share / your_capacity", format: "percent", decimals: 1 },
      ],
    };
  }

  return {
    title: "Scenario Impact Calculator",
    description: "Evaluate cost, return, and net value for your custom scenario.",
    assumptions: [
      "This calculator is generated for quick decision support.",
      "Adjust assumptions before using this for final commitments.",
    ],
    inputs: [
      { id: "monthly_budget", label: "Monthly Budget", type: "number", defaultValue: context.budgetAnchor || 600, min: 0, step: 10, unit: "USD" },
      { id: "scenario_cost", label: "Scenario Monthly Cost", type: "number", defaultValue: 280, min: 0, step: 10, unit: "USD" },
      { id: "expected_return", label: "Expected Annual Return (%)", type: "number", defaultValue: 8, min: 0, step: 0.1 },
      { id: "horizon_months", label: "Horizon (months)", type: "number", defaultValue: context.horizonMonths || 24, min: 1, step: 1 },
    ],
    outputs: [
      { id: "total_outflow", label: "Total Outflow", formula: "scenario_cost * horizon_months", format: "currency", decimals: 0 },
      { id: "future_value", label: "Future Value if Invested", formula: "scenario_cost * horizon_months + (scenario_cost * horizon_months * (expected_return / 100) * (horizon_months / 24))", format: "currency", decimals: 0 },
      { id: "budget_load", label: "Monthly Budget Load", formula: "scenario_cost / monthly_budget", format: "percent", decimals: 1 },
      { id: "remaining_buffer", label: "Remaining Monthly Buffer", formula: "monthly_budget - scenario_cost", format: "currency", decimals: 0 },
    ],
  };
}

function normalizeCalculatorSpec(responseData, question, context) {
  const fallback = buildFallbackCalculatorSpec(question, context);
  const candidate = responseData && typeof responseData === "object" && responseData.calculator
    ? responseData.calculator
    : responseData;
  if (!candidate || typeof candidate !== "object") {
    return fallback;
  }

  const title = typeof candidate.title === "string" && candidate.title.trim()
    ? candidate.title.trim()
    : fallback.title;
  const description = typeof candidate.description === "string" && candidate.description.trim()
    ? candidate.description.trim()
    : fallback.description;
  const assumptions = normalizeStringList(candidate.assumptions, fallback.assumptions);

  const rawInputs = Array.isArray(candidate.inputs) ? candidate.inputs : fallback.inputs;
  const normalizedInputs = rawInputs
    .map((input, index) => {
      if (!input || typeof input !== "object") {
        return null;
      }
      const id = sanitizeId(input.id || input.label || `input_${index + 1}`, `input_${index + 1}`);
      const label = typeof input.label === "string" && input.label.trim() ? input.label.trim() : `Input ${index + 1}`;
      return {
        id,
        label,
        type: input.type === "number" ? "number" : "number",
        defaultValue: asFiniteNumber(input.defaultValue, 0),
        min: asFiniteNumber(input.min, 0),
        max: Number.isFinite(Number(input.max)) ? Number(input.max) : undefined,
        step: Number.isFinite(Number(input.step)) ? Number(input.step) : 1,
        unit: typeof input.unit === "string" ? input.unit : "",
      };
    })
    .filter(Boolean);

  const rawOutputs = Array.isArray(candidate.outputs) ? candidate.outputs : fallback.outputs;
  const normalizedOutputs = rawOutputs
    .map((output, index) => {
      if (!output || typeof output !== "object" || typeof output.formula !== "string") {
        return null;
      }
      const id = sanitizeId(output.id || output.label || `output_${index + 1}`, `output_${index + 1}`);
      const label = typeof output.label === "string" && output.label.trim() ? output.label.trim() : `Output ${index + 1}`;
      const format = output.format === "currency" || output.format === "percent" ? output.format : "number";
      return {
        id,
        label,
        formula: output.formula,
        format,
        decimals: Number.isInteger(output.decimals) ? output.decimals : format === "currency" ? 0 : 2,
        percentScale: output.percentScale === "raw" ? "raw" : "ratio",
      };
    })
    .filter(Boolean);

  if (normalizedInputs.length === 0 || normalizedOutputs.length === 0) {
    return fallback;
  }

  return {
    title,
    description,
    assumptions,
    inputs: normalizedInputs,
    outputs: normalizedOutputs,
  };
}

function mockAIResponse(task, payload) {
  if (task === "individual-analysis") {
    const score = payload.metrics.healthScore;
    return {
      summary:
        score >= 70
          ? "You are operating from a relatively stable base. The largest upside comes from tightening discretionary burn and accelerating emergency runway."
          : "Cash flow is pressured. Prioritize debt stabilization and a runway target before increasing risk in investments.",
      insightPills: [
        {
          tone: payload.metrics.debtToIncome > 0.28 ? "danger" : "warning",
          label:
            payload.metrics.debtToIncome > 0.28
              ? "Debt-to-income is pressuring flexibility"
              : "Debt is manageable but should trend down",
        },
        {
          tone: payload.metrics.runwayMonths >= 4 ? "good" : "warning",
          label:
            payload.metrics.runwayMonths >= 4
              ? "Runway is building in the right direction"
              : "Runway under 4 months. Build emergency cushion first",
        },
        {
          tone: payload.metrics.savingsRate >= 0.18 ? "good" : "warning",
          label:
            payload.metrics.savingsRate >= 0.18
              ? "Savings behavior is disciplined"
              : "Raise savings rate with automated transfers",
        },
      ],
      topAction:
        "Cap discretionary spend at 22% of income for the next 90 days and redirect the difference to emergency reserve.",
      projection: {
        m6: Math.round(payload.input.savings * 6 * 1.02),
        y1: Math.round(payload.input.savings * 12 * 1.05),
        y3: Math.round(payload.input.savings * 36 * 1.12),
      },
    };
  }

  if (task === "stock-scorecards") {
    const base = payload.riskProfile === "growth" ? 70 : payload.riskProfile === "balanced" ? 74 : 78;
    const scores = payload.tickers.map((ticker, index) => {
      const modifier = (ticker.charCodeAt(0) + index * 13) % 17;
      const fitScore = clamp((base + modifier) / 100, 0.55, 0.96) * 100;
      const valuation = Math.round(clamp((base + ((modifier + 2) % 8)) / 100, 0.55, 0.95) * 100);
      const profitability = Math.round(clamp((base + ((modifier + 4) % 12)) / 100, 0.58, 0.96) * 100);
      const cashflow = Math.round(clamp((base + ((modifier + 1) % 9)) / 100, 0.56, 0.95) * 100);
      const volatility = Math.round(clamp((78 - ((modifier + 6) % 14)) / 100, 0.52, 0.9) * 100);
      const liquidity = Math.round(clamp((82 + ((modifier + 3) % 9)) / 100, 0.68, 0.98) * 100);
      return {
        ticker,
        fitScore: Math.round(fitScore),
        riskLabel: payload.riskProfile,
        subscores: {
          valuation,
          profitability,
          cashflow,
          volatility,
          liquidity,
        },
        rationale: `Fits a ${payload.riskProfile} profile and can be accumulated within a ${formatCurrency(
          payload.investBudget
        )} monthly budget using staggered entries.`,
        caution:
          payload.riskProfile === "conservative"
            ? "Use tighter position sizing and prefer broad ETFs for downside control."
            : "Watch valuation spikes and avoid concentrated single-stock exposure.",
        allocationHint: `Cap position at ${payload.maxPositionPct}% and phase entries over 3 tranches.`,
      };
    });
    return { scores };
  }

  if (task === "value-plan") {
    const goalAmount = asFiniteNumber(payload.goalAmount, 0);
    const goalMonths = Math.max(1, asFiniteNumber(payload.goalMonths, 12));
    const style = payload.planStyle || "balanced";
    const monthlySavings = asFiniteNumber(payload.context?.input?.savings, 0);
    const neededMonthly = goalAmount / goalMonths;
    const gap = neededMonthly - monthlySavings;

    return {
      overview:
        gap <= 0
          ? `Your current savings pace is enough to reach ${formatCurrency(goalAmount)} in ${goalMonths} months.`
          : `You are short by about ${formatCurrency(gap)} per month for your target timeline. The plan should close this gap first.`,
      focusAreas: [
        { tone: gap > 0 ? "warning" : "good", label: "Goal pacing check" },
        {
          tone: payload.context?.metrics?.debtToIncome > 0.28 ? "danger" : "good",
          label: payload.context?.metrics?.debtToIncome > 0.28 ? "Debt pressure is high" : "Debt pressure is manageable",
        },
        {
          tone: payload.context?.metrics?.runwayMonths < 4 ? "warning" : "good",
          label: payload.context?.metrics?.runwayMonths < 4 ? "Runway below target" : "Runway is stable",
        },
      ],
      priorityActions: [
        style === "aggressive"
          ? "Redirect 65% of discretionary overspend into goal bucket for the next 12 weeks."
          : "Redirect 40% of discretionary overspend into goal bucket with weekly tracking.",
        "Automate transfers within 24 hours of salary credit to avoid spending leakage.",
        "Review debt refinancing options if interest burden remains above tolerance.",
      ],
      checkpoints: {
        m1: "Establish transfer automation and cap discretionary spending.",
        m3: "Validate progress against target run-rate and tighten leak categories.",
        m6: "Reallocate surplus between emergency reserve and goal pool.",
      },
      guardrails: [
        "Do not reduce minimum debt payments to accelerate investing.",
        "Keep at least one month of essential expense as untouchable buffer.",
      ],
    };
  }

  if (task === "calculator-builder") {
    const calculator = buildFallbackCalculatorSpec(payload.question, payload.context);
    return {
      calculator,
      guidance:
        "Calculator generated from your scenario question. Tune assumptions before taking final decisions.",
    };
  }

  if (task === "team-budget-assignment") {
    const config = TEAM_TYPE_CONFIGS[payload.teamType] || TEAM_TYPE_CONFIGS.outsourced;
    const readiness = asFiniteNumber(payload.metrics?.deliveryReadiness, 0.72);
    const riskAdjustment = clamp(1.16 - readiness, 0.88, 1.28);
    const lineItems = config.lineItems.map((item, index) => ({
      id: item.id,
      label: item.label,
      projected: Math.round(item.defaultValue * riskAdjustment * (1 + index * 0.03)),
    }));

    return {
      lineItems,
      rationale:
        "Projected budgets account for team type, readiness, and accountability gap. Final values should be confirmed against current delivery constraints.",
      opportunities: [
        "Bundle recurring vendor and tooling spend under one procurement lane.",
        "Tie contingency release to milestone acceptance to improve accountability.",
        "Review low-impact line items before increasing core delivery costs.",
      ],
      warnings:
        readiness < 0.7
          ? ["Readiness is below preferred threshold. Keep reserve buffer intact."]
          : ["Readiness is stable. You may optimize reserve gradually."],
    };
  }

  return {};
}

async function callAI(task, payload) {
  const settings = loadSettings();
  if (!settings.endpoint || settings.useMock) {
    return mockAIResponse(task, payload);
  }

  const headers = {
    "Content-Type": "application/json",
  };
  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  const response = await fetch(settings.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      task,
      model: settings.model || undefined,
      payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI endpoint error (${response.status})`);
  }

  return response.json();
}

function renderIndividualAIResult(data) {
  const output = document.getElementById("individual-ai-output");
  const insightPills = Array.isArray(data.insightPills) ? data.insightPills : [];
  const projection = data.projection || {};

  const pillsMarkup =
    insightPills.length > 0
      ? `<div class="insight-pills">${insightPills
          .map((pill) => `<span class="pill ${pill.tone || "neutral"}">${pill.label || "Insight"}</span>`)
          .join("")}</div>`
      : "";

  output.innerHTML = `
    <p><strong>Summary:</strong> ${data.summary || "No summary returned."}</p>
    ${pillsMarkup}
    <p><strong>Top Action:</strong> ${data.topAction || "No action returned."}</p>
    <p><strong>Projection:</strong> 6mo ${formatCurrency(projection.m6 || 0)} | 1yr ${formatCurrency(
      projection.y1 || 0
    )} | 3yr ${formatCurrency(projection.y3 || 0)}</p>
  `;
}

function renderStockScorecards(data) {
  const output = document.getElementById("stock-score-output");
  const scores = Array.isArray(data.scores) ? [...data.scores] : [];

  if (scores.length === 0) {
    output.innerHTML = `<p class="muted">No stock scorecards were returned by the AI endpoint.</p>`;
    return;
  }

  scores.sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0));
  output.innerHTML = scores
    .map((item) => {
      const scoreClass = item.fitScore >= 80 ? "good" : item.fitScore >= 65 ? "warning" : "danger";
      const subscores = item.subscores || {};
      return `
        <article class="stock-card">
          <div class="stock-head">
            <h4>${item.ticker || "N/A"}</h4>
            <span class="stock-score pill ${scoreClass}">${item.fitScore || 0}/100 fit</span>
          </div>
          <p class="small-note"><strong>Risk:</strong> ${item.riskLabel || "N/A"}</p>
          <div class="stock-subscores">
            <span class="mini-chip">Valuation ${subscores.valuation ?? "N/A"}</span>
            <span class="mini-chip">Profitability ${subscores.profitability ?? "N/A"}</span>
            <span class="mini-chip">Cashflow ${subscores.cashflow ?? "N/A"}</span>
            <span class="mini-chip">Volatility ${subscores.volatility ?? "N/A"}</span>
            <span class="mini-chip">Liquidity ${subscores.liquidity ?? "N/A"}</span>
          </div>
          <p class="small-note">${item.rationale || ""}</p>
          <p class="small-note"><strong>Allocation:</strong> ${item.allocationHint || "No allocation hint returned."}</p>
          <p class="small-note"><strong>Caution:</strong> ${item.caution || "No caution notes."}</p>
        </article>
      `;
    })
    .join("");
}

function renderValueLevers(input, metrics) {
  const cashflowFlex = input.income > 0 ? clamp(input.disposable / input.income) : 0;
  const debtPressure = input.income > 0 ? clamp(input.debtPayment / input.income) : 0;
  const safetyBuffer = clamp(metrics.runwayMonths / 6);
  const investReadiness = clamp(metrics.savingsRate * 0.55 + safetyBuffer * 0.3 + (1 - debtPressure) * 0.15);

  document.getElementById("lever-cashflow").textContent = formatPercent(cashflowFlex);
  document.getElementById("lever-debt").textContent = formatPercent(debtPressure);
  document.getElementById("lever-buffer").textContent = formatPercent(safetyBuffer);
  document.getElementById("lever-invest").textContent = formatPercent(investReadiness);

  document.getElementById("lever-cashflow-note").textContent =
    cashflowFlex >= 0.22 ? "Good flexibility for goal acceleration." : "Tight cashflow. Reduce fixed leakages.";
  document.getElementById("lever-debt-note").textContent =
    debtPressure >= 0.28 ? "High pressure. Debt optimization is priority." : "Pressure is under control.";
  document.getElementById("lever-buffer-note").textContent =
    safetyBuffer >= 0.66 ? "Buffer can absorb shocks." : "Increase emergency buffer before higher risk.";
  document.getElementById("lever-invest-note").textContent =
    investReadiness >= 0.65 ? "Ready for disciplined investing." : "Improve savings and runway first.";
}

function renderValuePlan(data) {
  const output = document.getElementById("value-plan-output");
  const focusAreas = Array.isArray(data.focusAreas) ? data.focusAreas : [];
  const priorityActions = Array.isArray(data.priorityActions) ? data.priorityActions : [];
  const guardrails = Array.isArray(data.guardrails) ? data.guardrails : [];
  const checkpoints = data.checkpoints || {};

  const focusMarkup =
    focusAreas.length > 0
      ? `<div class="insight-pills">${focusAreas
          .map((item) => `<span class="pill ${item.tone || "neutral"}">${item.label || "Focus"}</span>`)
          .join("")}</div>`
      : "";

  output.innerHTML = `
    <p><strong>Overview:</strong> ${data.overview || "No value overview returned."}</p>
    ${focusMarkup}
    <p><strong>Priority Actions:</strong></p>
    <ol>
      ${priorityActions.map((item) => `<li>${item}</li>`).join("")}
    </ol>
    <p><strong>Checkpoints:</strong> M1: ${checkpoints.m1 || "-"} | M3: ${checkpoints.m3 || "-"} | M6: ${
      checkpoints.m6 || "-"
    }</p>
    <p><strong>Guardrails:</strong> ${guardrails.join(" | ") || "-"}</p>
  `;
}

function appendCalculatorHistory(question, calculatorTitle) {
  const historyNode = document.getElementById("calculator-history");
  const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const itemMarkup = `
    <div class="history-item">
      <p><strong>${calculatorTitle}</strong> (${timestamp})</p>
      <p>${question}</p>
    </div>
  `;

  if (historyNode.querySelector(".history-item")) {
    historyNode.insertAdjacentHTML("afterbegin", itemMarkup);
  } else {
    historyNode.innerHTML = itemMarkup;
  }
}

function renderCalculatorBuilderNotes(data, question, spec) {
  const output = document.getElementById("calculator-builder-notes");
  const guidance = typeof data?.guidance === "string" && data.guidance.trim()
    ? data.guidance.trim()
    : "Calculator generated. Verify assumptions before decision use.";
  output.innerHTML = `
    <p><strong>Question:</strong> ${question}</p>
    <p><strong>Guidance:</strong> ${guidance}</p>
    <p><strong>Model Shape:</strong> ${spec.inputs.length} inputs, ${spec.outputs.length} outputs.</p>
  `;
}

function recomputeDynamicCalculator(spec) {
  const scope = {};
  spec.inputs.forEach((input) => {
    const node = document.querySelector(`[data-calc-input="${input.id}"]`);
    scope[input.id] = asFiniteNumber(node?.value, 0);
  });

  spec.outputs.forEach((output) => {
    const raw = safeEvaluateFormula(output.formula, scope);
    if (Number.isFinite(raw)) {
      scope[output.id] = raw;
    }
    const target = document.querySelector(`#calc-output-${output.id} strong`);
    if (target) {
      target.textContent = formatCalculatedOutput(raw, output);
    }
  });
}

function renderDynamicCalculator(spec) {
  const container = document.getElementById("dynamic-calculator");
  const assumptionsMarkup = spec.assumptions
    .map((item) => `<li>${item}</li>`)
    .join("");

  const inputsMarkup = spec.inputs
    .map((input) => {
      const minAttr = Number.isFinite(input.min) ? `min="${input.min}"` : "";
      const maxAttr = Number.isFinite(input.max) ? `max="${input.max}"` : "";
      const stepAttr = Number.isFinite(input.step) ? `step="${input.step}"` : `step="1"`;
      const unitLabel = input.unit ? ` (${input.unit})` : "";
      return `
        <label for="calc-input-${input.id}">${input.label}${unitLabel}</label>
        <input
          id="calc-input-${input.id}"
          data-calc-input="${input.id}"
          type="number"
          value="${input.defaultValue}"
          ${minAttr}
          ${maxAttr}
          ${stepAttr}
        />
      `;
    })
    .join("");

  const outputsMarkup = spec.outputs
    .map(
      (output) => `
        <div class="calc-output-row" id="calc-output-${output.id}">
          <p>${output.label}</p>
          <strong>--</strong>
        </div>
      `
    )
    .join("");

  container.innerHTML = `
    <div class="calc-head">
      <h3>${spec.title}</h3>
      <p class="small-note">${spec.description}</p>
      <ul class="assumption-list">${assumptionsMarkup}</ul>
    </div>
    <div class="calc-grid">
      <div class="calc-inputs form-grid">
        <h4>Inputs</h4>
        ${inputsMarkup}
      </div>
      <div class="calc-outputs">
        <h4>Outputs</h4>
        ${outputsMarkup}
      </div>
    </div>
  `;

  container.querySelectorAll("[data-calc-input]").forEach((node) => {
    node.addEventListener("input", () => recomputeDynamicCalculator(spec));
  });
  recomputeDynamicCalculator(spec);
}

function getTeamTypeConfig(teamType) {
  return TEAM_TYPE_CONFIGS[teamType] || TEAM_TYPE_CONFIGS.outsourced;
}

function setBudgetInputsEditable(enabled) {
  budgetEditingEnabled = enabled;
  const finalInputs = document.querySelectorAll(".budget-final-input");
  finalInputs.forEach((input) => {
    input.disabled = !enabled;
  });
  const editButton = document.getElementById("edit-budget");
  if (editButton) {
    editButton.textContent = enabled ? "Lock Project Budget" : "Edit Project Budget";
  }
}

function renderBudgetRows(config, projectedMap = {}, finalMap = {}) {
  const body = document.getElementById("budget-line-items");
  body.innerHTML = config.lineItems
    .map((item) => {
      const projected = Number.isFinite(projectedMap[item.id]) ? projectedMap[item.id] : item.defaultValue;
      const finalBudget = Number.isFinite(finalMap[item.id]) ? finalMap[item.id] : projected;
      return `
        <tr data-line-id="${item.id}">
          <td>${item.label}</td>
          <td>
            <input class="budget-ai-input" data-line-id="${item.id}" type="number" min="0" value="${projected}" disabled />
          </td>
          <td>
            <input class="budget-final-input" data-line-id="${item.id}" type="number" min="0" value="${finalBudget}" disabled />
          </td>
          <td><span id="variance-${item.id}" class="variance-neutral">${formatCurrency(0)}</span></td>
        </tr>
      `;
    })
    .join("");
}

function applyTeamTypeConfig(teamType, preserveValues = false) {
  activeTeamType = TEAM_TYPE_CONFIGS[teamType] ? teamType : "outsourced";
  const config = getTeamTypeConfig(activeTeamType);
  document.getElementById("team-tool-name").textContent = config.toolName;
  document.getElementById("team-tool-description").textContent = config.description;
  document.getElementById("col-base-cost").textContent = config.baseLabel;
  document.getElementById("col-allocation").textContent = config.allocationLabel;
  document.getElementById("col-accountability").textContent = config.accountabilityLabel;
  document.getElementById("col-outcome").textContent = config.outcomeLabel;
  document.getElementById("budget-table-title").textContent = config.budgetTitle;
  document.getElementById("budget-table-note").textContent = config.budgetNote;

  let projectedMap = {};
  let finalMap = {};
  if (preserveValues) {
    document.querySelectorAll(".budget-ai-input").forEach((input) => {
      projectedMap[input.dataset.lineId] = toNumber(input.value);
    });
    document.querySelectorAll(".budget-final-input").forEach((input) => {
      finalMap[input.dataset.lineId] = toNumber(input.value);
    });
  }

  renderBudgetRows(config, projectedMap, finalMap);
  setBudgetInputsEditable(false);
  const editButton = document.getElementById("edit-budget");
  if (editButton) {
    editButton.disabled = true;
  }
}

function getTeamMember(index) {
  const name = document.getElementById(`m${index}-name`).value.trim() || `Role ${index}`;
  const baseCost = toNumber(document.getElementById(`m${index}-base`).value);
  const allocationPct = Math.min(100, toNumber(document.getElementById(`m${index}-alloc`).value));
  const accountabilityPct = Math.min(100, toNumber(document.getElementById(`m${index}-account`).value));
  const outcomePct = Math.min(100, toNumber(document.getElementById(`m${index}-outcome`).value));
  const effectiveCost = baseCost * (allocationPct / 100);
  const accountabilityFactor = (accountabilityPct / 100) * (outcomePct / 100);
  return {
    name,
    baseCost,
    allocationPct,
    accountabilityPct,
    outcomePct,
    effectiveCost,
    accountabilityFactor,
  };
}

function collectBudgetLineItems() {
  const rows = document.querySelectorAll("#budget-line-items tr");
  return Array.from(rows).map((row) => {
    const id = row.dataset.lineId;
    const label = row.querySelector("td").textContent.trim();
    const projected = toNumber(row.querySelector(".budget-ai-input").value);
    const finalBudget = toNumber(row.querySelector(".budget-final-input").value);
    return {
      id,
      label,
      projected,
      finalBudget,
      variance: finalBudget - projected,
    };
  });
}

function collectTeamInputs() {
  const teamType = document.getElementById("team-type").value;
  const config = getTeamTypeConfig(teamType);
  const members = [1, 2, 3, 4].map((index) => getTeamMember(index));
  const budgetLines = collectBudgetLineItems();
  const targetOutcome = document.getElementById("team-outcome").value.trim();
  return { teamType, config, members, budgetLines, targetOutcome };
}

function computeTeamBudgetMetrics(teamData) {
  const memberCost = teamData.members.reduce((sum, member) => sum + member.effectiveCost, 0);
  const projectedOpsCost = teamData.budgetLines.reduce((sum, line) => sum + line.projected, 0);
  const finalOpsCost = teamData.budgetLines.reduce((sum, line) => sum + line.finalBudget, 0);

  const avgAccountability =
    teamData.members.reduce((sum, member) => sum + member.accountabilityPct / 100, 0) / teamData.members.length;
  const avgOutcome =
    teamData.members.reduce((sum, member) => sum + member.outcomePct / 100, 0) / teamData.members.length;
  const deliveryReadiness = clamp(avgAccountability * 0.45 + avgOutcome * 0.55);

  const coreBudget = memberCost + finalOpsCost;
  const reserve = coreBudget * teamData.config.reserveMultiplier * (1.15 - deliveryReadiness);
  const totalBudget = coreBudget + reserve;
  const outcomeAdjustedCost = totalBudget / Math.max(0.35, avgOutcome);

  return {
    memberCost,
    projectedOpsCost,
    finalOpsCost,
    coreBudget,
    reserve,
    totalBudget,
    outcomeAdjustedCost,
    avgAccountability,
    avgOutcome,
    deliveryReadiness,
  };
}

function renderTeamBreakdown(teamData, metrics) {
  document.getElementById("team-total").textContent = formatCurrency(metrics.totalBudget);
  document.getElementById("team-reserve").textContent = formatCurrency(metrics.reserve);
  document.getElementById("team-readiness").textContent = formatPercent(metrics.deliveryReadiness);
  document.getElementById("team-outcome-cost").textContent = formatCurrency(metrics.outcomeAdjustedCost);

  teamData.budgetLines.forEach((line) => {
    const varianceNode = document.getElementById(`variance-${line.id}`);
    if (!varianceNode) {
      return;
    }
    varianceNode.textContent = formatCurrency(line.variance);
    varianceNode.className =
      line.variance > 0
        ? "variance-negative"
        : line.variance < 0
          ? "variance-positive"
          : "variance-neutral";
  });

  const rows = teamData.members
    .map(
      (member) => `
        <tr>
          <td>${member.name}</td>
          <td>${formatCurrency(member.effectiveCost)}</td>
          <td>${member.accountabilityPct.toFixed(0)}%</td>
          <td>${member.outcomePct.toFixed(0)}%</td>
          <td>${formatPercent(member.accountabilityFactor)}</td>
        </tr>
      `
    )
    .join("");

  document.getElementById("team-breakdown").innerHTML = `
    <table class="breakdown-table">
      <thead>
        <tr>
          <th>Team Role</th>
          <th>Effective Cost</th>
          <th>Accountability</th>
          <th>Outcome</th>
          <th>Responsibility Index</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderTeamAIOutput(data) {
  const outputNode = document.getElementById("team-ai-output");
  const opportunities = Array.isArray(data.opportunities) ? data.opportunities : [];
  const warnings = Array.isArray(data.warnings) ? data.warnings : [];
  outputNode.innerHTML = `
    <p><strong>AI Rationale:</strong> ${data.rationale || "No rationale returned."}</p>
    <p><strong>Optimization Opportunities:</strong></p>
    <ol>
      ${opportunities.map((item) => `<li>${item}</li>`).join("")}
    </ol>
    <p><strong>Warnings:</strong> ${warnings.join(" | ") || "No critical warnings."}</p>
  `;
}

function applyAIBudgetAssignment(result, config) {
  const projectedMap = {};
  const finalMap = {};
  const lineItems = Array.isArray(result.lineItems) ? result.lineItems : [];
  lineItems.forEach((item) => {
    const normalizedId = sanitizeId(item.id || item.label, item.id || "line");
    const projected = toNumber(item.projected);
    projectedMap[normalizedId] = projected;
    finalMap[normalizedId] = projected;
  });

  renderBudgetRows(config, projectedMap, finalMap);
  setBudgetInputsEditable(false);
  const editButton = document.getElementById("edit-budget");
  if (editButton) {
    editButton.disabled = false;
  }
}

function initializeIndividualSection() {
  const inputIds = [
    "income",
    "housing",
    "utilities",
    "groceries",
    "transport",
    "healthcare",
    "lifestyle",
    "savings",
    "debt-payment",
    "emergency-fund",
  ];

  const refresh = () => {
    const input = collectIndividualValues();
    const metrics = computeHealthMetrics(input);
    renderIndividualMetrics(metrics);
    renderValueLevers(input, metrics);
    return { input, metrics };
  };

  inputIds.forEach((id) => {
    const node = document.getElementById(id);
    node.addEventListener("input", refresh);
  });

  const analyzeButton = document.getElementById("run-individual-analysis");
  analyzeButton.addEventListener("click", async () => {
    const outputNode = document.getElementById("individual-ai-output");
    const context = refresh();
    setLoading(outputNode, true);
    outputNode.innerHTML = `<p class="muted">Running AI analysis against your live context object...</p>`;
    try {
      const result = await callAI("individual-analysis", context);
      renderIndividualAIResult(result);
    } catch (error) {
      outputNode.innerHTML = `<p class="risk-note">AI request failed: ${error.message}. Turn on mock mode or verify endpoint.</p>`;
    } finally {
      setLoading(outputNode, false);
    }
  });

  const valuePlanButton = document.getElementById("run-value-plan");
  valuePlanButton.addEventListener("click", async () => {
    const outputNode = document.getElementById("value-plan-output");
    const context = refresh();
    const goalAmount = toNumber(document.getElementById("goal-amount").value);
    const goalMonths = Math.max(1, toNumber(document.getElementById("goal-months").value));
    const planStyle = document.getElementById("plan-style").value;

    setLoading(outputNode, true);
    outputNode.innerHTML = `<p class="muted">Generating value plan from your live profile and goal constraints...</p>`;
    try {
      const result = await callAI("value-plan", {
        goalAmount,
        goalMonths,
        planStyle,
        context,
      });
      renderValuePlan(result);
    } catch (error) {
      outputNode.innerHTML = `<p class="risk-note">AI request failed: ${error.message}. Turn on mock mode or verify endpoint.</p>`;
    } finally {
      setLoading(outputNode, false);
    }
  });

  const stockButton = document.getElementById("run-stock-score");
  stockButton.addEventListener("click", async () => {
    const outputNode = document.getElementById("stock-score-output");
    const latest = refresh();
    const investBudget = toNumber(document.getElementById("invest-budget").value);
    const riskProfile = document.getElementById("risk-profile").value;
    const sectorPreferences = document
      .getElementById("sector-preferences")
      .value.split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const scorecardMode = document.getElementById("scorecard-mode").value;
    const maxPositionPct = toNumber(document.getElementById("max-position").value);
    const tickers = document
      .getElementById("tickers")
      .value.split(",")
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);

    if (tickers.length === 0) {
      outputNode.innerHTML = `<p class="risk-note">Add at least one ticker to score.</p>`;
      return;
    }

    setLoading(outputNode, true);
    outputNode.innerHTML = `<p class="muted">Scoring stocks with AI using budget and profile context...</p>`;

    try {
      const result = await callAI("stock-scorecards", {
        investBudget,
        riskProfile,
        sectorPreferences,
        scorecardMode,
        maxPositionPct,
        tickers,
        healthSnapshot: latest.metrics,
      });
      renderStockScorecards(result);
    } catch (error) {
      outputNode.innerHTML = `<p class="risk-note">AI request failed: ${error.message}. Turn on mock mode or verify endpoint.</p>`;
    } finally {
      setLoading(outputNode, false);
    }
  });

  refresh();
}

function initializeScenarioSection() {
  const buildButton = document.getElementById("build-calculator");
  if (!buildButton) {
    return;
  }

  buildButton.addEventListener("click", async () => {
    const question = document.getElementById("calculator-question").value.trim();
    const notesNode = document.getElementById("calculator-builder-notes");
    const calculatorNode = document.getElementById("dynamic-calculator");

    if (!question) {
      notesNode.innerHTML = `<p class="risk-note">Enter a scenario question first to generate a calculator.</p>`;
      return;
    }

    const budgetAnchor = toNumber(document.getElementById("calc-context-budget").value);
    const horizonMonths = Math.max(1, toNumber(document.getElementById("calc-context-horizon").value));
    const riskPreference = document.getElementById("calc-context-risk").value;
    const input = collectIndividualValues();
    const metrics = computeHealthMetrics(input);

    const context = {
      budgetAnchor,
      horizonMonths,
      riskPreference,
      healthSnapshot: metrics,
      income: input.income,
      monthlySavings: input.savings,
    };

    setLoading(notesNode, true);
    setLoading(calculatorNode, true);
    notesNode.innerHTML = `<p class="muted">Generating calculator schema from your scenario question...</p>`;

    try {
      const result = await callAI("calculator-builder", { question, context });
      const spec = normalizeCalculatorSpec(result, question, context);
      renderCalculatorBuilderNotes(result, question, spec);
      renderDynamicCalculator(spec);
      appendCalculatorHistory(question, spec.title);
    } catch (error) {
      const fallbackSpec = buildFallbackCalculatorSpec(question, context);
      renderCalculatorBuilderNotes(
        { guidance: `AI endpoint failed (${error.message}). Fallback calculator generated.` },
        question,
        fallbackSpec
      );
      renderDynamicCalculator(fallbackSpec);
      appendCalculatorHistory(question, fallbackSpec.title);
    } finally {
      setLoading(notesNode, false);
      setLoading(calculatorNode, false);
    }
  });
}

function initializeTeamSection() {
  const memberInputIds = [
    "m1-name",
    "m1-base",
    "m1-alloc",
    "m1-account",
    "m1-outcome",
    "m2-name",
    "m2-base",
    "m2-alloc",
    "m2-account",
    "m2-outcome",
    "m3-name",
    "m3-base",
    "m3-alloc",
    "m3-account",
    "m3-outcome",
    "m4-name",
    "m4-base",
    "m4-alloc",
    "m4-account",
    "m4-outcome",
    "team-outcome",
  ];

  const teamTypeSelect = document.getElementById("team-type");
  const budgetBody = document.getElementById("budget-line-items");
  const runAiButton = document.getElementById("run-team-analysis");
  const editButton = document.getElementById("edit-budget");
  const calculateButton = document.getElementById("recalculate-budget");
  const outputNode = document.getElementById("team-ai-output");

  const recalc = () => {
    const teamData = collectTeamInputs();
    const metrics = computeTeamBudgetMetrics(teamData);
    renderTeamBreakdown(teamData, metrics);
    return { teamData, metrics };
  };

  memberInputIds.forEach((id) => {
    document.getElementById(id).addEventListener("input", recalc);
  });

  teamTypeSelect.addEventListener("change", () => {
    applyTeamTypeConfig(teamTypeSelect.value);
    recalc();
    outputNode.innerHTML = `<p class="muted">Team type updated. Run AI budget assignment for new projections.</p>`;
  });

  budgetBody.addEventListener("input", (event) => {
    if (event.target.classList.contains("budget-final-input")) {
      recalc();
    }
  });

  editButton.addEventListener("click", () => {
    if (editButton.disabled) {
      return;
    }
    setBudgetInputsEditable(!budgetEditingEnabled);
  });

  calculateButton.addEventListener("click", () => {
    recalc();
  });

  runAiButton.addEventListener("click", async () => {
    const snapshot = recalc();
    setLoading(outputNode, true);
    outputNode.innerHTML = `<p class="muted">Running AI budget assignment for company-cost planning...</p>`;

    try {
      const result = await callAI("team-budget-assignment", {
        teamType: snapshot.teamData.teamType,
        targetOutcome: snapshot.teamData.targetOutcome,
        members: snapshot.teamData.members,
        metrics: snapshot.metrics,
      });
      applyAIBudgetAssignment(result, snapshot.teamData.config);
      recalc();
      renderTeamAIOutput(result);
    } catch (error) {
      outputNode.innerHTML = `<p class="risk-note">AI request failed: ${error.message}. Turn on mock mode or verify endpoint.</p>`;
    } finally {
      setLoading(outputNode, false);
    }
  });

  applyTeamTypeConfig(teamTypeSelect.value);
  recalc();
}

function boot() {
  switchTabs();
  initializeStockCollapsible();
  initializeSettingsUI();
  initializeIndividualSection();
  initializeScenarioSection();
  initializeTeamSection();
}

boot();

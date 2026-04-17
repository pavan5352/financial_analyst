import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Info,
  KeyRound,
  Lightbulb,
  Loader2,
  Plus,
  Scale,
  Settings,
  Sparkles,
  Swords,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  User,
  Users,
  XCircle,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'

// ---------- Types ----------
type Severity = 'danger' | 'warning' | 'tip' | 'info'

interface Insight {
  severity: Severity
  title: string
  detail: string
}

interface IndividualAnalysis {
  score_summary: string
  health_band: string
  insights: Insight[]
  top_action: string
  projection: { months: number; balance: number; note: string }[]
  guardrails: string[]
}

interface TeamMember {
  id: string
  name: string
  income: number
}

interface SharedExpense {
  id: string
  label: string
  amount: number
}

interface TeamAnalysis {
  fairness_summary: string
  per_member_reasoning: { name: string; reasoning: string }[]
  savings_opportunities: { title: string; detail: string; monthly_save: number }[]
  equal_vs_proportional_note: string
}

interface Scenario {
  id: string
  label: string
  description: string
  amount: number
  kind: 'investment' | 'savings' | 'debt_payoff' | 'purchase'
}

interface BattleAnalysis {
  winner: 'A' | 'B' | 'tie'
  winner_reasoning: string
  projections: {
    scenario: 'A' | 'B'
    months_6: number
    months_12: number
    months_36: number
    rationale: string
  }[]
  risk: { scenario: 'A' | 'B'; level: 'low' | 'medium' | 'high'; note: string }[]
  wildcard: string
}

// ---------- Constants ----------
const EXPENSE_CATEGORIES = [
  'Housing',
  'Food',
  'Transport',
  'Entertainment',
  'Utilities',
  'Other',
] as const

type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]
type Expenses = Record<ExpenseCategory, number>

const DEFAULT_EXPENSES: Expenses = {
  Housing: 1200,
  Food: 400,
  Transport: 250,
  Entertainment: 180,
  Utilities: 150,
  Other: 150,
}

const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7']

// ---------- Utilities ----------
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Math.round(n))

const fmtPct = (n: number) => `${(n * 100).toFixed(0)}%`
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))
const newId = () => Math.random().toString(36).slice(2, 9)

// Extract the first top-level JSON object/array from a Claude response.
function extractJson(raw: string): string {
  let s = raw.trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const startBrace = s.indexOf('{')
  const startBracket = s.indexOf('[')
  let start = -1
  if (startBrace === -1) start = startBracket
  else if (startBracket === -1) start = startBrace
  else start = Math.min(startBrace, startBracket)
  if (start === -1) return s
  const open = s[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') inStr = false
    } else {
      if (c === '"') inStr = true
      else if (c === open) depth++
      else if (c === close) {
        depth--
        if (depth === 0) return s.slice(start, i + 1)
      }
    }
  }
  return s.slice(start)
}

// ---------- Financial Health Score ----------
interface FHSBreakdown {
  score: number
  band: string
  bandColor: string
  savingsRate: number
  expenseRatio: number
  debtToIncome: number
  components: { label: string; value: number; max: number }[]
}

function computeFHS(params: {
  income: number
  expenses: Expenses
  monthlySavings: number
  debt: number
}): FHSBreakdown {
  const { income, expenses, monthlySavings, debt } = params
  const safeIncome = Math.max(income, 1)
  const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0)
  const savingsRate = clamp(monthlySavings / safeIncome, 0, 1)
  const expenseRatio = clamp(totalExpenses / safeIncome, 0, 3)
  const debtToIncome = clamp(debt / (safeIncome * 12), 0, 3)

  const savingsPts = clamp((savingsRate / 0.3) * 40, 0, 40)
  const expensePts = clamp((1 - expenseRatio / 1) * 60, 0, 30)
  const debtPts = clamp((1 - debtToIncome) * 30, 0, 30)

  const raw = savingsPts + expensePts + debtPts
  const score = Math.round(clamp(raw, 0, 100))

  let band = 'Excellent'
  let bandColor = 'text-emerald-600'
  if (score < 40) {
    band = 'At Risk'
    bandColor = 'text-rose-600'
  } else if (score < 60) {
    band = 'Fragile'
    bandColor = 'text-amber-600'
  } else if (score < 80) {
    band = 'Healthy'
    bandColor = 'text-sky-600'
  }

  return {
    score,
    band,
    bandColor,
    savingsRate,
    expenseRatio,
    debtToIncome,
    components: [
      { label: 'Savings', value: Math.round(savingsPts), max: 40 },
      { label: 'Expense discipline', value: Math.round(expensePts), max: 30 },
      { label: 'Debt load', value: Math.round(debtPts), max: 30 },
    ],
  }
}

// ---------- Claude API ----------
type ClaudeWindow = Window & {
  claude?: { complete?: (prompt: string) => Promise<string> }
}

type ClaudeMode = 'artifact' | 'api-key' | 'demo'

function detectMode(): ClaudeMode {
  if (typeof window !== 'undefined') {
    const w = window as ClaudeWindow
    if (typeof w.claude?.complete === 'function') return 'artifact'
  }
  if (typeof localStorage !== 'undefined' && localStorage.getItem('anthropic_key')) {
    return 'api-key'
  }
  return 'demo'
}

async function callClaude(prompt: string): Promise<string> {
  const w = window as ClaudeWindow
  if (typeof w.claude?.complete === 'function') {
    return await w.claude.complete(prompt)
  }
  const key = localStorage.getItem('anthropic_key')
  if (!key) throw new Error('no_api_key')
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`anthropic_http_${resp.status}: ${text.slice(0, 200)}`)
  }
  const data = (await resp.json()) as { content: { text: string }[] }
  return data.content?.[0]?.text ?? ''
}

// ---------- Deterministic demo responses ----------
function demoIndividualResponse(input: {
  income: number
  expenses: Expenses
  monthlySavings: number
  debt: number
  fhs: FHSBreakdown
}): IndividualAnalysis {
  const { income, expenses, monthlySavings, debt, fhs } = input
  const totalExpenses = Object.values(expenses).reduce((a, b) => a + b, 0)
  const top = Object.entries(expenses).sort((a, b) => b[1] - a[1])[0]
  const insights: Insight[] = []
  if (fhs.savingsRate < 0.1)
    insights.push({
      severity: 'danger',
      title: 'Savings rate is below 10%',
      detail: `You're saving ${fmtCurrency(monthlySavings)}/mo — at your income that's only ${fmtPct(
        fhs.savingsRate,
      )}. Target 15–20%.`,
    })
  else if (fhs.savingsRate < 0.2)
    insights.push({
      severity: 'warning',
      title: 'Savings rate is in the fragile zone',
      detail: `You save ${fmtPct(fhs.savingsRate)} of income. Push to 20% for a stronger buffer.`,
    })
  else
    insights.push({
      severity: 'tip',
      title: 'Solid savings discipline',
      detail: `At ${fmtPct(fhs.savingsRate)} savings rate, you're ahead of most peers. Keep it up.`,
    })

  if (fhs.expenseRatio > 0.85)
    insights.push({
      severity: 'danger',
      title: 'Expenses eat most of your income',
      detail: `Expenses are ${fmtPct(fhs.expenseRatio)} of income — biggest slice is ${top[0]} at ${fmtCurrency(top[1])}.`,
    })
  else
    insights.push({
      severity: 'info',
      title: `${top[0]} is your largest category`,
      detail: `${fmtCurrency(top[1])}/mo — watch this line if you want the fastest lever on your FHS.`,
    })

  if (debt > income * 6)
    insights.push({
      severity: 'warning',
      title: 'Debt load is heavy vs income',
      detail: `Debt ${fmtCurrency(debt)} is ${(debt / Math.max(income, 1)).toFixed(1)}× monthly income. Aggressive paydown recommended.`,
    })

  const projection: IndividualAnalysis['projection'] = [6, 12, 36].map((m) => ({
    months: m,
    balance: monthlySavings * m,
    note:
      m === 6
        ? 'Straight-line projection of current monthly surplus.'
        : m === 12
          ? 'Assumes no lifestyle inflation and stable income.'
          : 'Over 3 years, compounding at 5% would add ~10% more.',
  }))

  return {
    score_summary: `FHS ${fhs.score}/100 — ${fhs.band}. Surplus of ${fmtCurrency(
      income - totalExpenses,
    )}/mo, saving ${fmtCurrency(monthlySavings)}/mo.`,
    health_band: fhs.band,
    insights,
    top_action:
      fhs.savingsRate < 0.15
        ? `Cut ${top[0]} by 20% (${fmtCurrency(top[1] * 0.2)}) and redirect it to savings.`
        : debt > income * 3
          ? `Route your next ${fmtCurrency(monthlySavings * 0.5)}/mo to debt — breakeven in ~${Math.round(debt / Math.max(monthlySavings * 0.5, 1))} months.`
          : `Automate a ${fmtCurrency(monthlySavings * 0.2)} bump to savings — lifestyle impact minimal, FHS +5 in 6 months.`,
    projection,
    guardrails: [
      'Projection assumes today inputs — re-run monthly as your numbers change.',
      'Demo mode uses deterministic heuristics; connect Claude for personalized reasoning.',
    ],
  }
}

function demoTeamResponse(input: {
  members: TeamMember[]
  expenses: SharedExpense[]
  splits: { memberId: string; name: string; share: number; contribution: number }[]
  totalShared: number
}): TeamAnalysis {
  const { members, expenses, splits, totalShared } = input
  const sortedBySplit = [...splits].sort((a, b) => b.contribution - a.contribution)
  const top = sortedBySplit[0]
  const bottom = sortedBySplit[sortedBySplit.length - 1]
  const biggestExpense = [...expenses].sort((a, b) => b.amount - a.amount)[0]
  return {
    fairness_summary: `Proportional split keeps each person's burden-to-income ratio equal (${fmtPct(
      top.share,
    )} of team income contributes ${fmtPct(top.share)} of the bill). Equal split would overtax ${bottom.name} by ${fmtCurrency(totalShared / members.length - bottom.contribution)}/mo.`,
    per_member_reasoning: splits.map((s) => ({
      name: s.name,
      reasoning: `Contributes ${fmtCurrency(s.contribution)} (${fmtPct(s.share)} of ${fmtCurrency(totalShared)}). Matches their share of team income — no over- or under-contribution.`,
    })),
    savings_opportunities: [
      {
        title: `Review "${biggestExpense?.label ?? 'top expense'}"`,
        detail: `It's ${fmtCurrency(biggestExpense?.amount ?? 0)}/mo — a 15% cut saves everyone proportionally without renegotiating the split.`,
        monthly_save: Math.round((biggestExpense?.amount ?? 0) * 0.15),
      },
      {
        title: 'Batch shared subscriptions',
        detail: 'Consolidate overlapping tools onto a single team account; typical redundancy is 20-30% of tool spend.',
        monthly_save: Math.round(totalShared * 0.08),
      },
      {
        title: 'Quarterly reset',
        detail: 'Re-run this split every 3 months — promotions/role changes shift income ratios and the split should follow.',
        monthly_save: 0,
      },
    ],
    equal_vs_proportional_note: `Equal 25/25/25/25 would charge ${bottom.name} ${fmtCurrency(
      totalShared / members.length,
    )}/mo vs their proportional ${fmtCurrency(bottom.contribution)}/mo — demo mode; hook up Claude for deeper reasoning.`,
  }
}

function demoBattleResponse(a: Scenario, b: Scenario): BattleAnalysis {
  const project = (s: Scenario) => {
    switch (s.kind) {
      case 'investment':
        return { m6: s.amount * 1.04, m12: s.amount * 1.08, m36: s.amount * 1.26 }
      case 'savings':
        return { m6: s.amount * 1.02, m12: s.amount * 1.04, m36: s.amount * 1.13 }
      case 'debt_payoff':
        return { m6: s.amount * 1.1, m12: s.amount * 1.2, m36: s.amount * 1.6 }
      default:
        return { m6: s.amount * 0.98, m12: s.amount * 0.95, m36: s.amount * 0.85 }
    }
  }
  const pa = project(a)
  const pb = project(b)
  const winner = pa.m36 > pb.m36 ? 'A' : pb.m36 > pa.m36 ? 'B' : 'tie'
  const riskOf = (s: Scenario): 'low' | 'medium' | 'high' =>
    s.kind === 'investment' ? 'medium' : s.kind === 'purchase' ? 'high' : 'low'
  return {
    winner,
    winner_reasoning:
      winner === 'tie'
        ? 'Dead heat at 3 years — pick based on liquidity needs, not expected value.'
        : `${winner === 'A' ? a.label : b.label} wins on 3-year expected value under demo heuristics.`,
    projections: [
      {
        scenario: 'A',
        months_6: pa.m6,
        months_12: pa.m12,
        months_36: pa.m36,
        rationale: `${a.label}: ${a.kind} assumption — standard demo curve.`,
      },
      {
        scenario: 'B',
        months_6: pb.m6,
        months_12: pb.m12,
        months_36: pb.m36,
        rationale: `${b.label}: ${b.kind} assumption — standard demo curve.`,
      },
    ],
    risk: [
      { scenario: 'A', level: riskOf(a), note: 'Demo heuristic risk — connect Claude for calibrated assessment.' },
      { scenario: 'B', level: riskOf(b), note: 'Demo heuristic risk — connect Claude for calibrated assessment.' },
    ],
    wildcard:
      'A 0.5% rate change flips debt-payoff math. Re-run when macro conditions shift materially.',
  }
}

// ---------- Prompts ----------
function buildIndividualPrompt(i: {
  income: number
  expenses: Expenses
  monthlySavings: number
  debt: number
  fhs: FHSBreakdown
}) {
  return `You are FinSync, an assistant that grounds every answer in the user's exact numbers.

USER CONTEXT (all USD, monthly unless noted):
- Monthly income: ${i.income}
- Expenses: ${JSON.stringify(i.expenses)}
- Total monthly expenses: ${Object.values(i.expenses).reduce((a, b) => a + b, 0)}
- Monthly savings contribution: ${i.monthlySavings}
- Outstanding debt (total): ${i.debt}
- Financial Health Score (computed client-side): ${i.fhs.score}/100 — ${i.fhs.band}
- Savings rate: ${(i.fhs.savingsRate * 100).toFixed(1)}%
- Expense ratio: ${(i.fhs.expenseRatio * 100).toFixed(1)}%
- Debt-to-annual-income: ${(i.fhs.debtToIncome * 100).toFixed(1)}%

TASK:
Return ONLY a JSON object matching this TypeScript type (no prose, no markdown fences):
{
  "score_summary": string,
  "health_band": string,
  "insights": Array<{"severity": "danger"|"warning"|"tip"|"info","title": string,"detail": string}>,
  "top_action": string,
  "projection": Array<{"months": number,"balance": number,"note": string}>,
  "guardrails": string[]
}

Rules:
- Every insight references a specific number from USER CONTEXT.
- Projections assume current monthly savings continues; you may add modest compounding at 36 months.
- Output only the JSON object.`
}

function buildTeamPrompt(p: {
  members: TeamMember[]
  expenses: SharedExpense[]
  splits: { memberId: string; name: string; share: number; contribution: number }[]
  totalShared: number
  totalIncome: number
}) {
  return `You are FinSync. You compare fair, proportional team splits against naive equal splits.

TEAM:
${p.members.map((m) => `- ${m.name}: income ${m.income}/mo`).join('\n')}
Total team income: ${p.totalIncome}/mo

SHARED EXPENSES (monthly):
${p.expenses.map((e) => `- ${e.label}: ${e.amount}`).join('\n')}
Total shared: ${p.totalShared}/mo

PROPORTIONAL SPLITS (by income share):
${p.splits.map((s) => `- ${s.name}: share=${(s.share * 100).toFixed(1)}% → contributes ${s.contribution.toFixed(2)}/mo`).join('\n')}

TASK:
Return ONLY a JSON object (no markdown fences) matching this TypeScript type:
{
  "fairness_summary": string,
  "per_member_reasoning": Array<{"name": string,"reasoning": string}>,
  "savings_opportunities": Array<{"title": string,"detail": string,"monthly_save": number}>,
  "equal_vs_proportional_note": string
}

Rules:
- Reference specific dollar figures from TEAM and SHARED EXPENSES in every field.
- Include exactly 3 savings_opportunities.
- Output only the JSON object.`
}

function buildBattlePrompt(a: Scenario, b: Scenario) {
  return `You are FinSync. You run head-to-head scenario battles with 6mo/1yr/3yr projections.

SCENARIO A:
- label: ${a.label}
- description: ${a.description}
- amount: ${a.amount}
- kind: ${a.kind}

SCENARIO B:
- label: ${b.label}
- description: ${b.description}
- amount: ${b.amount}
- kind: ${b.kind}

TASK:
Return ONLY a JSON object (no markdown fences) matching this TypeScript type:
{
  "winner": "A" | "B" | "tie",
  "winner_reasoning": string,
  "projections": Array<{"scenario":"A"|"B","months_6":number,"months_12":number,"months_36":number,"rationale":string}>,
  "risk": Array<{"scenario":"A"|"B","level":"low"|"medium"|"high","note":string}>,
  "wildcard": string
}

Rules:
- Use reasonable assumptions (equities ~7%/yr, HYSA ~4%/yr, debt interest saved when paid off).
- Reference actual amounts in each rationale.
- Output only the JSON object.`
}

// ---------- Shared UI primitives ----------
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`bg-white/80 backdrop-blur rounded-2xl border border-slate-200 shadow-sm ${className}`}
    >
      {children}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  prefix = '$',
  placeholder,
  step = 10,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  prefix?: string
  placeholder?: string
  step?: number
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">{label}</span>
      <div className="mt-1 relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
            {prefix}
          </span>
        )}
        <input
          type="number"
          min={0}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          placeholder={placeholder}
          onChange={(e) => onChange(Number(e.target.value || 0))}
          className={`w-full rounded-lg border border-slate-200 bg-white py-2 ${
            prefix ? 'pl-7' : 'pl-3'
          } pr-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100`}
        />
      </div>
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (s: string) => void
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
    </label>
  )
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (s: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-none"
      />
    </label>
  )
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function PrimaryButton({
  onClick,
  disabled,
  loading,
  children,
  icon: Icon,
}: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  children: React.ReactNode
  icon?: typeof Sparkles
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  )
}

function GhostButton({
  onClick,
  children,
  icon: Icon,
}: {
  onClick: () => void
  children: React.ReactNode
  icon?: typeof Settings
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      {Icon ? <Icon size={14} /> : null}
      {children}
    </button>
  )
}

function SeverityPill({ insight }: { insight: Insight }) {
  const map: Record<Severity, { bg: string; fg: string; Icon: typeof Info }> = {
    danger: { bg: 'bg-rose-50 border-rose-200', fg: 'text-rose-700', Icon: XCircle },
    warning: { bg: 'bg-amber-50 border-amber-200', fg: 'text-amber-700', Icon: AlertTriangle },
    tip: { bg: 'bg-emerald-50 border-emerald-200', fg: 'text-emerald-700', Icon: CheckCircle2 },
    info: { bg: 'bg-sky-50 border-sky-200', fg: 'text-sky-700', Icon: Info },
  }
  const m = map[insight.severity]
  const Icon = m.Icon
  return (
    <div className={`rounded-xl border p-3 ${m.bg}`}>
      <div className={`flex items-center gap-2 ${m.fg} font-semibold text-sm`}>
        <Icon size={14} />
        {insight.title}
      </div>
      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{insight.detail}</p>
    </div>
  )
}

function HealthScoreDial({ fhs }: { fhs: FHSBreakdown }) {
  const radius = 60
  const circ = 2 * Math.PI * radius
  const offset = circ * (1 - fhs.score / 100)
  const color =
    fhs.score >= 80
      ? '#10b981'
      : fhs.score >= 60
        ? '#0ea5e9'
        : fhs.score >= 40
          ? '#f59e0b'
          : '#ef4444'
  return (
    <div className="flex items-center gap-5">
      <div className="relative">
        <svg width={160} height={160} viewBox="0 0 160 160">
          <circle cx={80} cy={80} r={radius} stroke="#e2e8f0" strokeWidth={12} fill="none" />
          <circle
            cx={80}
            cy={80}
            r={radius}
            stroke={color}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            fill="none"
            transform="rotate(-90 80 80)"
            style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.2s' }}
          />
          <text
            x={80}
            y={78}
            textAnchor="middle"
            className="fill-slate-900"
            style={{ fontSize: '34px', fontWeight: 700 }}
          >
            {fhs.score}
          </text>
          <text x={80} y={102} textAnchor="middle" className="fill-slate-500" style={{ fontSize: '11px' }}>
            FIN HEALTH
          </text>
        </svg>
      </div>
      <div className="flex-1">
        <div className={`text-lg font-bold ${fhs.bandColor}`}>{fhs.band}</div>
        <div className="text-xs text-slate-500 mt-1">Live score — updates as you type.</div>
        <div className="mt-3 space-y-1.5">
          {fhs.components.map((c) => (
            <div key={c.label}>
              <div className="flex justify-between text-xs text-slate-600">
                <span>{c.label}</span>
                <span className="tabular-nums">
                  {c.value}/{c.max}
                </span>
              </div>
              <div className="mt-0.5 h-1.5 bg-slate-100 rounded">
                <div
                  className="h-1.5 rounded bg-indigo-500"
                  style={{ width: `${(c.value / c.max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------- Settings modal ----------
function SettingsModal({
  open,
  onClose,
  onSaved,
  mode,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  mode: ClaudeMode
}) {
  const [key, setKey] = useState(() => localStorage.getItem('anthropic_key') ?? '')
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-slate-200">
        <div className="p-5 border-b border-slate-100 flex items-center gap-2">
          <KeyRound size={18} className="text-indigo-500" />
          <h3 className="text-lg font-semibold text-slate-900">AI mode</h3>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600">
            ×
          </button>
        </div>
        <div className="p-5 space-y-4 text-sm text-slate-600">
          <p>
            FinSync calls Claude for every AI feature. It detects three modes automatically and
            the app keeps working in all of them.
          </p>
          <div className="space-y-2">
            <ModeRow
              label="Artifact mode"
              active={mode === 'artifact'}
              detail="Running inside Claude.ai artifact — uses window.claude.complete, API key handled automatically."
            />
            <ModeRow
              label="Direct API mode"
              active={mode === 'api-key'}
              detail="Calls api.anthropic.com directly with your key. Stored in your browser's localStorage only."
            />
            <ModeRow
              label="Demo mode"
              active={mode === 'demo'}
              detail="No key set — uses deterministic heuristics grounded in the same inputs. Great for the team presentation."
            />
          </div>
          <div className="pt-2 border-t border-slate-100">
            <TextField
              label="Anthropic API key (optional)"
              value={key}
              onChange={setKey}
              placeholder="sk-ant-..."
            />
            <p className="text-xs text-slate-500 mt-1">
              Stored locally in your browser. Leave empty to use demo mode.
            </p>
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
          <GhostButton
            onClick={() => {
              localStorage.removeItem('anthropic_key')
              setKey('')
              onSaved()
            }}
          >
            Clear key
          </GhostButton>
          <PrimaryButton
            onClick={() => {
              if (key.trim()) localStorage.setItem('anthropic_key', key.trim())
              onSaved()
            }}
          >
            Save
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

function ModeRow({ label, active, detail }: { label: string; active: boolean; detail: string }) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        active ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${active ? 'bg-indigo-500' : 'bg-slate-300'}`} />
        <span className={`text-sm font-semibold ${active ? 'text-indigo-700' : 'text-slate-700'}`}>
          {label}
        </span>
        {active && (
          <span className="ml-auto text-xs font-medium text-indigo-600 uppercase tracking-wide">
            active
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{detail}</p>
    </div>
  )
}

// ---------- Individual tab ----------
function IndividualTab({ mode, onOpenSettings }: { mode: ClaudeMode; onOpenSettings: () => void }) {
  const [income, setIncome] = useState(5200)
  const [expenses, setExpenses] = useState<Expenses>({ ...DEFAULT_EXPENSES })
  const [monthlySavings, setMonthlySavings] = useState(600)
  const [debt, setDebt] = useState(8500)
  const [analysis, setAnalysis] = useState<IndividualAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fhs = useMemo(
    () => computeFHS({ income, expenses, monthlySavings, debt }),
    [income, expenses, monthlySavings, debt],
  )
  const totalExpenses = useMemo(
    () => Object.values(expenses).reduce((a, b) => a + b, 0),
    [expenses],
  )
  const surplus = income - totalExpenses

  const expenseChartData = EXPENSE_CATEGORIES.map((cat) => ({
    name: cat,
    value: expenses[cat],
  }))

  async function runAnalysis() {
    setLoading(true)
    setError(null)
    try {
      if (mode === 'demo') {
        setAnalysis(demoIndividualResponse({ income, expenses, monthlySavings, debt, fhs }))
      } else {
        const prompt = buildIndividualPrompt({ income, expenses, monthlySavings, debt, fhs })
        const raw = await callClaude(prompt)
        const parsed = JSON.parse(extractJson(raw)) as IndividualAnalysis
        setAnalysis(parsed)
      }
    } catch (err) {
      setError((err as Error).message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <Card className="lg:col-span-2 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <User size={18} className="text-indigo-500" />
          <h2 className="text-base font-semibold text-slate-900">Your financial snapshot</h2>
        </div>
        <NumberField label="Monthly income" value={income} onChange={setIncome} step={100} />
        <div>
          <div className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2">
            Monthly expenses
          </div>
          <div className="grid grid-cols-2 gap-3">
            {EXPENSE_CATEGORIES.map((cat) => (
              <NumberField
                key={cat}
                label={cat}
                value={expenses[cat]}
                onChange={(v) => setExpenses((prev) => ({ ...prev, [cat]: v }))}
                step={25}
              />
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Monthly savings"
            value={monthlySavings}
            onChange={setMonthlySavings}
            step={50}
          />
          <NumberField label="Total debt" value={debt} onChange={setDebt} step={250} />
        </div>
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-slate-500">
            Surplus this month:{' '}
            <span
              className={
                surplus >= 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'
              }
            >
              {fmtCurrency(surplus)}
            </span>
          </div>
          <PrimaryButton onClick={runAnalysis} loading={loading} icon={Sparkles}>
            {loading ? 'Analyzing…' : 'Analyze with AI'}
          </PrimaryButton>
        </div>
        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
            {error === 'no_api_key' ? (
              <>
                No API key set.{' '}
                <button className="underline font-semibold" onClick={onOpenSettings}>
                  Add one
                </button>{' '}
                or switch to demo mode.
              </>
            ) : (
              error
            )}
          </div>
        )}
      </Card>

      <div className="lg:col-span-3 space-y-5">
        <Card className="p-5">
          <HealthScoreDial fhs={fhs} />
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <StatBox label="Income" value={fmtCurrency(income)} />
            <StatBox label="Expenses" value={fmtCurrency(totalExpenses)} />
            <StatBox
              label="Savings rate"
              value={fmtPct(fhs.savingsRate)}
              tone={fhs.savingsRate >= 0.2 ? 'good' : fhs.savingsRate >= 0.1 ? 'warn' : 'bad'}
            />
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={16} className="text-indigo-500" />
            <h3 className="text-sm font-semibold text-slate-900">Expense mix</h3>
          </div>
          <div className="h-52">
            <ResponsiveContainer>
              <BarChart data={expenseChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(v: number) => fmtCurrency(v)}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {expenseChartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {analysis && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Brain size={16} className="text-violet-500" />
              <h3 className="text-sm font-semibold text-slate-900">Claude analysis</h3>
              <span className="ml-auto text-xs text-slate-400 uppercase tracking-wide">{mode}</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{analysis.score_summary}</p>

            <div className="grid md:grid-cols-2 gap-3">
              {analysis.insights.map((ins, i) => (
                <SeverityPill key={i} insight={ins} />
              ))}
            </div>

            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
              <div className="flex items-center gap-2 text-indigo-700 font-semibold text-sm">
                <Target size={14} /> Top action
              </div>
              <p className="text-sm text-slate-700 mt-1 leading-relaxed">{analysis.top_action}</p>
            </div>

            <div>
              <div className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-2">
                Projection
              </div>
              <div className="h-48">
                <ResponsiveContainer>
                  <AreaChart
                    data={analysis.projection.map((p) => ({
                      name: `${p.months}mo`,
                      balance: p.balance,
                    }))}
                  >
                    <defs>
                      <linearGradient id="gproj" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                      formatter={(v: number) => fmtCurrency(v)}
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fill="url(#gproj)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-2 text-xs text-slate-500">
                {analysis.projection.map((p) => (
                  <div key={p.months}>{p.note}</div>
                ))}
              </div>
            </div>

            {analysis.guardrails?.length ? (
              <div className="text-xs text-slate-500 border-t border-slate-100 pt-3">
                <div className="font-semibold text-slate-600 mb-1">Assumptions</div>
                <ul className="list-disc ml-4 space-y-0.5">
                  {analysis.guardrails.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        )}
      </div>
    </div>
  )
}

function StatBox({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'good' | 'warn' | 'bad' | 'neutral'
}) {
  const toneCls =
    tone === 'good'
      ? 'text-emerald-600'
      : tone === 'warn'
        ? 'text-amber-600'
        : tone === 'bad'
          ? 'text-rose-600'
          : 'text-slate-900'
  return (
    <div className="bg-slate-50 rounded-xl py-3 px-2 border border-slate-100">
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  )
}

// ---------- Team tab ----------
function TeamTab({ mode, onOpenSettings }: { mode: ClaudeMode; onOpenSettings: () => void }) {
  const [members, setMembers] = useState<TeamMember[]>([
    { id: newId(), name: 'Pavan', income: 5200 },
    { id: newId(), name: 'Aanya', income: 4100 },
    { id: newId(), name: 'Rohit', income: 6800 },
    { id: newId(), name: 'Maya', income: 3400 },
  ])
  const [expenses, setExpenses] = useState<SharedExpense[]>([
    { id: newId(), label: 'Shared tools', amount: 180 },
    { id: newId(), label: 'Team meals', amount: 420 },
    { id: newId(), label: 'Travel', amount: 650 },
    { id: newId(), label: 'Misc', amount: 120 },
  ])
  const [analysis, setAnalysis] = useState<TeamAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalIncome = useMemo(() => members.reduce((s, m) => s + m.income, 0), [members])
  const totalShared = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses])

  const splits = useMemo(() => {
    if (totalIncome <= 0)
      return members.map((m) => ({ memberId: m.id, name: m.name, share: 0, contribution: 0 }))
    return members.map((m) => {
      const share = m.income / totalIncome
      return {
        memberId: m.id,
        name: m.name,
        share,
        contribution: share * totalShared,
      }
    })
  }, [members, totalIncome, totalShared])

  const equalContribution = members.length > 0 ? totalShared / members.length : 0

  const splitChartData = splits.map((s, i) => ({
    name: s.name,
    proportional: Math.round(s.contribution),
    equal: Math.round(equalContribution),
    color: CHART_COLORS[i % CHART_COLORS.length],
  }))

  async function runAnalysis() {
    setLoading(true)
    setError(null)
    try {
      if (mode === 'demo') {
        setAnalysis(demoTeamResponse({ members, expenses, splits, totalShared }))
      } else {
        const prompt = buildTeamPrompt({ members, expenses, splits, totalShared, totalIncome })
        const raw = await callClaude(prompt)
        const parsed = JSON.parse(extractJson(raw)) as TeamAnalysis
        setAnalysis(parsed)
      }
    } catch (err) {
      setError((err as Error).message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid lg:grid-cols-5 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-indigo-500" />
            <h2 className="text-base font-semibold text-slate-900">Team members</h2>
            <button
              onClick={() =>
                setMembers((m) => [
                  ...m,
                  { id: newId(), name: `Member ${m.length + 1}`, income: 4000 },
                ])
              }
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              <Plus size={12} /> Add
            </button>
          </div>
          <div className="space-y-3">
            {members.map((m) => (
              <div key={m.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <TextField
                  label="Name"
                  value={m.name}
                  onChange={(v) =>
                    setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, name: v } : x)))
                  }
                />
                <NumberField
                  label="Monthly income"
                  value={m.income}
                  onChange={(v) =>
                    setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, income: v } : x)))
                  }
                  step={100}
                />
                <button
                  disabled={members.length <= 2}
                  onClick={() => setMembers((prev) => prev.filter((x) => x.id !== m.id))}
                  className="h-[38px] px-2 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-500 border-t border-slate-100 pt-2">
            Total team income:{' '}
            <span className="font-semibold text-slate-800">{fmtCurrency(totalIncome)}</span>/mo
          </div>
        </Card>

        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <DollarSign size={18} className="text-indigo-500" />
            <h2 className="text-base font-semibold text-slate-900">Shared expenses</h2>
            <button
              onClick={() =>
                setExpenses((e) => [...e, { id: newId(), label: 'New line', amount: 100 }])
              }
              className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              <Plus size={12} /> Add
            </button>
          </div>
          <div className="space-y-3">
            {expenses.map((e) => (
              <div key={e.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <TextField
                  label="Label"
                  value={e.label}
                  onChange={(v) =>
                    setExpenses((prev) =>
                      prev.map((x) => (x.id === e.id ? { ...x, label: v } : x)),
                    )
                  }
                />
                <NumberField
                  label="Amount / mo"
                  value={e.amount}
                  onChange={(v) =>
                    setExpenses((prev) =>
                      prev.map((x) => (x.id === e.id ? { ...x, amount: v } : x)),
                    )
                  }
                  step={10}
                />
                <button
                  disabled={expenses.length <= 1}
                  onClick={() => setExpenses((prev) => prev.filter((x) => x.id !== e.id))}
                  className="h-[38px] px-2 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <div className="text-xs text-slate-500 border-t border-slate-100 pt-2">
            Total shared:{' '}
            <span className="font-semibold text-slate-800">{fmtCurrency(totalShared)}</span>/mo
          </div>
        </Card>

        <div className="flex justify-end">
          <PrimaryButton onClick={runAnalysis} loading={loading} icon={Scale}>
            {loading ? 'Thinking…' : 'Get fairness analysis'}
          </PrimaryButton>
        </div>
        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
            {error === 'no_api_key' ? (
              <>
                No API key set.{' '}
                <button className="underline font-semibold" onClick={onOpenSettings}>
                  Add one
                </button>{' '}
                or switch to demo mode.
              </>
            ) : (
              error
            )}
          </div>
        )}
      </div>

      <div className="lg:col-span-3 space-y-5">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Scale size={16} className="text-indigo-500" />
            <h3 className="text-sm font-semibold text-slate-900">
              Proportional split vs equal split
            </h3>
            <span className="ml-auto text-xs text-slate-500">
              Equal would charge everyone{' '}
              <span className="font-semibold text-slate-700">
                {fmtCurrency(equalContribution)}/mo
              </span>
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={splitChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  formatter={(v: number) => fmtCurrency(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="proportional"
                  name="Proportional (by income)"
                  fill="#6366f1"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="equal"
                  name="Equal 25/25/25/25"
                  fill="#cbd5e1"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 space-y-2">
            {splits.map((s, i) => {
              const diff = equalContribution - s.contribution
              return (
                <div key={s.memberId} className="text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="font-semibold text-slate-800">{s.name}</span>
                    <span className="text-slate-500">
                      {fmtPct(s.share)} of team income → pays {fmtCurrency(s.contribution)}/mo
                    </span>
                    <span
                      className={`ml-auto text-xs font-medium ${
                        diff > 0
                          ? 'text-emerald-600'
                          : diff < 0
                            ? 'text-rose-600'
                            : 'text-slate-400'
                      }`}
                    >
                      {diff > 0
                        ? `saves ${fmtCurrency(diff)} vs equal`
                        : diff < 0
                          ? `pays ${fmtCurrency(-diff)} more vs equal (earns the most)`
                          : 'on par with equal'}
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded bg-slate-100 overflow-hidden">
                    <div
                      className="h-2"
                      style={{
                        width: `${(s.contribution / Math.max(totalShared, 1)) * 100}%`,
                        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {analysis && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Brain size={16} className="text-violet-500" />
              <h3 className="text-sm font-semibold text-slate-900">Claude fairness review</h3>
              <span className="ml-auto text-xs text-slate-400 uppercase tracking-wide">{mode}</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{analysis.fairness_summary}</p>

            <div className="grid md:grid-cols-2 gap-3">
              {analysis.per_member_reasoning.map((r, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="font-semibold text-slate-800 text-sm">{r.name}</div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{r.reasoning}</p>
                </div>
              ))}
            </div>

            <div>
              <div className="flex items-center gap-2 text-slate-800 font-semibold text-sm mb-2">
                <Lightbulb size={14} className="text-amber-500" /> Savings opportunities
              </div>
              <div className="space-y-2">
                {analysis.savings_opportunities.map((o, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 flex items-start gap-3"
                  >
                    <div className="text-xs font-bold text-amber-700 bg-white rounded-md px-2 py-1 border border-amber-200 tabular-nums whitespace-nowrap">
                      {o.monthly_save > 0 ? `${fmtCurrency(o.monthly_save)}/mo` : 'bonus'}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm text-slate-800">{o.title}</div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{o.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-slate-500 border-t border-slate-100 pt-2">
              {analysis.equal_vs_proportional_note}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

// ---------- Battle tab ----------
function BattleTab({ mode, onOpenSettings }: { mode: ClaudeMode; onOpenSettings: () => void }) {
  const [a, setA] = useState<Scenario>({
    id: newId(),
    label: 'Index fund buy-in',
    description: 'Lump-sum into a broad-market index fund (S&P 500), hold and reinvest dividends.',
    amount: 10000,
    kind: 'investment',
  })
  const [b, setB] = useState<Scenario>({
    id: newId(),
    label: 'Crush the credit card',
    description: 'Pay down a credit card balance at 22% APR in one shot.',
    amount: 10000,
    kind: 'debt_payoff',
  })
  const [result, setResult] = useState<BattleAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function runBattle() {
    setLoading(true)
    setError(null)
    try {
      if (mode === 'demo') {
        setResult(demoBattleResponse(a, b))
      } else {
        const raw = await callClaude(buildBattlePrompt(a, b))
        const parsed = JSON.parse(extractJson(raw)) as BattleAnalysis
        setResult(parsed)
      }
    } catch (err) {
      setError((err as Error).message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const chartData = result
    ? [
        { label: 'Now', A: a.amount, B: b.amount },
        {
          label: '6mo',
          A: result.projections.find((p) => p.scenario === 'A')?.months_6 ?? 0,
          B: result.projections.find((p) => p.scenario === 'B')?.months_6 ?? 0,
        },
        {
          label: '1yr',
          A: result.projections.find((p) => p.scenario === 'A')?.months_12 ?? 0,
          B: result.projections.find((p) => p.scenario === 'B')?.months_12 ?? 0,
        },
        {
          label: '3yr',
          A: result.projections.find((p) => p.scenario === 'A')?.months_36 ?? 0,
          B: result.projections.find((p) => p.scenario === 'B')?.months_36 ?? 0,
        },
      ]
    : []

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-2 gap-5">
        <ScenarioCard tag="A" scenario={a} onChange={setA} accent="from-indigo-500 to-sky-500" />
        <ScenarioCard tag="B" scenario={b} onChange={setB} accent="from-rose-500 to-orange-500" />
      </div>

      <div className="flex items-center justify-center gap-3">
        <PrimaryButton onClick={runBattle} loading={loading} icon={Swords}>
          {loading ? 'Running battle…' : 'Run battle'}
        </PrimaryButton>
        {error && (
          <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
            {error === 'no_api_key' ? (
              <>
                No API key set.{' '}
                <button className="underline font-semibold" onClick={onOpenSettings}>
                  Add one
                </button>{' '}
                or switch to demo mode.
              </>
            ) : (
              error
            )}
          </div>
        )}
      </div>

      {result && (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center gap-3">
              <Trophy size={22} className="text-amber-500" />
              <div>
                <div className="text-xs text-slate-500 uppercase tracking-wide">Winner</div>
                <div className="text-lg font-bold text-slate-900">
                  {result.winner === 'tie' ? 'Tie' : result.winner === 'A' ? a.label : b.label}
                </div>
              </div>
              <div className="ml-auto text-xs text-slate-400 uppercase tracking-wide">{mode}</div>
            </div>
            <p className="text-sm text-slate-700 mt-3 leading-relaxed">{result.winner_reasoning}</p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-indigo-500" />
              <h3 className="text-sm font-semibold text-slate-900">Head-to-head projection</h3>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                    formatter={(v: number) => fmtCurrency(v)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="A"
                    name={`A · ${a.label}`}
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    dot
                  />
                  <Line
                    type="monotone"
                    dataKey="B"
                    name={`B · ${b.label}`}
                    stroke="#ef4444"
                    strokeWidth={2.5}
                    dot
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-5">
            {(['A', 'B'] as const).map((tag) => {
              const s = tag === 'A' ? a : b
              const proj = result.projections.find((p) => p.scenario === tag)
              const risk = result.risk.find((r) => r.scenario === tag)
              const wins = result.winner === tag
              return (
                <Card key={tag} className={`p-5 ${wins ? 'ring-2 ring-amber-300' : ''}`}>
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-8 w-8 rounded-lg text-white font-bold flex items-center justify-center bg-gradient-to-br ${
                        tag === 'A'
                          ? 'from-indigo-500 to-sky-500'
                          : 'from-rose-500 to-orange-500'
                      }`}
                    >
                      {tag}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{s.label}</div>
                      <div className="text-xs text-slate-500">
                        {fmtCurrency(s.amount)} · {s.kind}
                      </div>
                    </div>
                    {risk && <RiskBadge level={risk.level} />}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <ProjCell label="6mo" value={proj?.months_6 ?? 0} base={s.amount} />
                    <ProjCell label="1yr" value={proj?.months_12 ?? 0} base={s.amount} />
                    <ProjCell label="3yr" value={proj?.months_36 ?? 0} base={s.amount} />
                  </div>
                  {proj && (
                    <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                      {proj.rationale}
                    </p>
                  )}
                  {risk && (
                    <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                      <span className="font-semibold text-slate-700">Risk note:</span> {risk.note}
                    </p>
                  )}
                </Card>
              )
            })}
          </div>

          <Card className="p-5 border-dashed border-2 bg-gradient-to-r from-amber-50 via-white to-rose-50">
            <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
              <Activity size={14} /> Wildcard that could flip this
            </div>
            <p className="text-sm text-slate-700 mt-1 leading-relaxed">{result.wildcard}</p>
          </Card>
        </div>
      )}
    </div>
  )
}

function ScenarioCard({
  tag,
  scenario,
  onChange,
  accent,
}: {
  tag: 'A' | 'B'
  scenario: Scenario
  onChange: (s: Scenario) => void
  accent: string
}) {
  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-2">
        <div
          className={`h-8 w-8 rounded-lg text-white font-bold flex items-center justify-center bg-gradient-to-br ${accent}`}
        >
          {tag}
        </div>
        <h3 className="text-sm font-semibold text-slate-900">Scenario {tag}</h3>
      </div>
      <TextField
        label="Label"
        value={scenario.label}
        onChange={(v) => onChange({ ...scenario, label: v })}
      />
      <TextArea
        label="Description"
        value={scenario.description}
        onChange={(v) => onChange({ ...scenario, description: v })}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Amount"
          value={scenario.amount}
          onChange={(v) => onChange({ ...scenario, amount: v })}
          step={250}
        />
        <SelectField
          label="Kind"
          value={scenario.kind}
          onChange={(v) => onChange({ ...scenario, kind: v })}
          options={[
            { value: 'investment', label: 'Investment' },
            { value: 'savings', label: 'Savings (HYSA/CD)' },
            { value: 'debt_payoff', label: 'Debt payoff' },
            { value: 'purchase', label: 'Purchase' },
          ]}
        />
      </div>
    </Card>
  )
}

function RiskBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const map = {
    low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    high: 'bg-rose-100 text-rose-700 border-rose-200',
  }
  return (
    <span
      className={`ml-auto text-[10px] font-semibold uppercase tracking-wider border rounded-full px-2 py-0.5 ${map[level]}`}
    >
      {level} risk
    </span>
  )
}

function ProjCell({ label, value, base }: { label: string; value: number; base: number }) {
  const delta = value - base
  const pct = base > 0 ? (delta / base) * 100 : 0
  const tone = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-slate-500'
  return (
    <div className="bg-slate-50 rounded-lg py-2 border border-slate-100">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-bold text-slate-900 tabular-nums">{fmtCurrency(value)}</div>
      <div className={`text-[10px] font-semibold ${tone}`}>
        {delta >= 0 ? '+' : ''}
        {pct.toFixed(1)}%
      </div>
    </div>
  )
}

// ---------- Main App ----------
type Tab = 'individual' | 'team' | 'battle'

export default function App() {
  const [tab, setTab] = useState<Tab>('individual')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mode, setMode] = useState<ClaudeMode>(detectMode())

  function refreshMode() {
    setMode(detectMode())
    setSettingsOpen(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/30 text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-5 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white flex items-center justify-center shadow-sm shadow-indigo-200">
            <Sparkles size={18} />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">FinSync</h1>
            <p className="text-xs text-slate-500 -mt-0.5">
              AI financial co-pilot — grounded in your actual numbers
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ModeBadge mode={mode} />
            <GhostButton onClick={() => setSettingsOpen(true)} icon={Settings}>
              AI mode
            </GhostButton>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-5 pb-3 flex gap-1 overflow-x-auto">
          <TabButton
            active={tab === 'individual'}
            onClick={() => setTab('individual')}
            icon={User}
            label="Individual Analysis"
            sub="Personal FHS · insights · projection"
          />
          <TabButton
            active={tab === 'team'}
            onClick={() => setTab('team')}
            icon={Users}
            label="Team Budget"
            sub="Proportional splits · fairness review"
          />
          <TabButton
            active={tab === 'battle'}
            onClick={() => setTab('battle')}
            icon={Swords}
            label="Scenario Battle"
            sub="Head-to-head · 6mo / 1yr / 3yr"
          />
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-5 py-6">
        {tab === 'individual' && (
          <IndividualTab mode={mode} onOpenSettings={() => setSettingsOpen(true)} />
        )}
        {tab === 'team' && <TeamTab mode={mode} onOpenSettings={() => setSettingsOpen(true)} />}
        {tab === 'battle' && (
          <BattleTab mode={mode} onOpenSettings={() => setSettingsOpen(true)} />
        )}
      </main>

      <footer className="max-w-7xl mx-auto px-5 py-6 text-xs text-slate-500 flex items-center gap-2">
        <ChevronRight size={12} />
        Not financial advice — a decision-support tool for individuals and small teams.
      </footer>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={refreshMode}
        mode={mode}
      />
    </div>
  )
}

function ModeBadge({ mode }: { mode: ClaudeMode }) {
  const map: Record<ClaudeMode, { label: string; cls: string }> = {
    artifact: {
      label: 'Artifact · Claude',
      cls: 'bg-violet-100 text-violet-700 border-violet-200',
    },
    'api-key': { label: 'Direct API', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    demo: { label: 'Demo mode', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  }
  const m = map[mode]
  return (
    <span
      className={`text-[10px] uppercase tracking-wider font-semibold border rounded-full px-2 py-1 ${m.cls}`}
    >
      {m.label}
    </span>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  sub,
}: {
  active: boolean
  onClick: () => void
  icon: typeof User
  label: string
  sub: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-left transition border ${
        active ? 'border-indigo-200 bg-white shadow-sm' : 'border-transparent hover:bg-white/70'
      }`}
    >
      <div
        className={`h-8 w-8 rounded-lg flex items-center justify-center ${
          active
            ? 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white'
            : 'bg-slate-100 text-slate-500'
        }`}
      >
        <Icon size={16} />
      </div>
      <div>
        <div className={`text-sm font-semibold ${active ? 'text-slate-900' : 'text-slate-600'}`}>
          {label}
        </div>
        <div className="text-[11px] text-slate-500 -mt-0.5">{sub}</div>
      </div>
    </button>
  )
}

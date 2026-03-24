"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

type Risk = { item: string; severity: "low" | "medium" | "high" };
type Story = { title: string; story: string; priority: "P0" | "P1" | "P2" };

type DecisionResult = {
  score: number;
  baseRecommendation: "BUILD" | "DELAY" | "KILL";
  recommendation: "BUILD" | "DELAY" | "KILL";
  rationale: string;
  assumptions: string[];
  risks: Risk[];
  questions: string[];
  mvp_scope: { in: string[]; out: string[] };
  metrics: string[];
  user_stories: Story[];
};

type StrategicGoal =
  | "Revenue"
  | "Retention"
  | "Compliance"
  | "Efficiency"
  | "Customer Experience";

type ImpactLevel = "None" | "Low" | "Medium" | "High";
type StandardLevel = "Low" | "Medium" | "High";
type UrgencyLevel = "Low" | "Medium" | "High" | "Critical";

type DecisionInput = {
  featureName: string;
  description: string;

  strategicGoal: StrategicGoal;

  revenueImpact: ImpactLevel;
  costSaving: ImpactLevel;
  userImpact: StandardLevel;
  regulatoryUrgency: UrgencyLevel;
  timeSensitivity: StandardLevel;
  dependencyComplexity: StandardLevel;

  effort: number;
  confidence: number;
  riskLevel: StandardLevel;

  assumptions?: string;
  evidence?: string;
};

type SavedDecision = {
  id: string;
  createdAt: number;
  input: DecisionInput;
  output: DecisionResult;
};

const STORAGE_KEY = "decision_engine_saved_v2";

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function severityBadge(sev: Risk["severity"]) {
  if (sev === "high") return "border-red-200 bg-red-50 text-red-700";
  if (sev === "medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function recBadge(rec: DecisionResult["recommendation"]) {
  if (rec === "BUILD") return "bg-emerald-600 text-white";
  if (rec === "DELAY") return "bg-amber-500 text-white";
  return "bg-red-600 text-white";
}

function neutralBadge() {
  return "rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-700";
}

function levelToScore(value: ImpactLevel | StandardLevel | UrgencyLevel) {
  const map: Record<string, number> = {
    None: 0,
    Low: 1,
    Medium: 2,
    High: 3,
    Critical: 4,
  };
  return map[value] ?? 0;
}

function labelTone(value: string) {
  if (value === "Critical" || value === "High") return "border-red-200 bg-red-50 text-red-700";
  if (value === "Medium") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

function getTopRisk(risks: Risk[]) {
  if (!risks?.length) return null;
  return (
    risks.find((r) => r.severity === "high") ||
    risks.find((r) => r.severity === "medium") ||
    risks[0]
  );
}

function defaultDecisionInput(): DecisionInput {
  return {
    featureName: "",
    description: "",
    strategicGoal: "Revenue",
    revenueImpact: "Medium",
    costSaving: "Medium",
    userImpact: "Medium",
    regulatoryUrgency: "Medium",
    timeSensitivity: "Medium",
    dependencyComplexity: "Medium",
    effort: 5,
    confidence: 3,
    riskLevel: "Medium",
    assumptions: "",
    evidence: "",
  };
}

function normalizeDecisionInput(input: Partial<DecisionInput> & Record<string, unknown>): DecisionInput {
  return {
    featureName: typeof input.featureName === "string" ? input.featureName : "",
    description: typeof input.description === "string" ? input.description : "",
    strategicGoal:
      typeof input.strategicGoal === "string"
        ? (input.strategicGoal as StrategicGoal)
        : typeof input.goal === "string"
        ? mapLegacyGoal(input.goal)
        : "Revenue",
    revenueImpact:
      typeof input.revenueImpact === "string"
        ? (input.revenueImpact as ImpactLevel)
        : typeof input.impact === "string"
        ? mapLegacyImpact(input.impact)
        : "Medium",
    costSaving:
      typeof input.costSaving === "string" ? (input.costSaving as ImpactLevel) : "Medium",
    userImpact: typeof input.userImpact === "string" ? (input.userImpact as StandardLevel) : "Medium",
    regulatoryUrgency:
      typeof input.regulatoryUrgency === "string"
        ? (input.regulatoryUrgency as UrgencyLevel)
        : "Medium",
    timeSensitivity:
      typeof input.timeSensitivity === "string"
        ? (input.timeSensitivity as StandardLevel)
        : "Medium",
    dependencyComplexity:
      typeof input.dependencyComplexity === "string"
        ? (input.dependencyComplexity as StandardLevel)
        : "Medium",
    effort:
      typeof input.effort === "number" && Number.isFinite(input.effort) ? input.effort : 5,
    confidence:
      typeof input.confidence === "number" && Number.isFinite(input.confidence)
        ? input.confidence
        : 3,
    riskLevel: typeof input.riskLevel === "string" ? (input.riskLevel as StandardLevel) : "Medium",
    assumptions: typeof input.assumptions === "string" ? input.assumptions : "",
    evidence: typeof input.evidence === "string" ? input.evidence : "",
  };
}

function mapLegacyGoal(goal: string): StrategicGoal {
  if (goal === "Retention") return "Retention";
  if (goal === "Revenue") return "Revenue";
  if (goal === "Tech debt") return "Efficiency";
  if (goal === "Enterprise") return "Customer Experience";
  return "Revenue";
}

function mapLegacyImpact(impact: string): ImpactLevel {
  if (impact === "Low") return "Low";
  if (impact === "High") return "High";
  return "Medium";
}

function getDecisionSummary(input: DecisionInput, result: DecisionResult) {
  const reasons: string[] = [];

  const valueSignals = [
    { label: "revenue impact", value: input.revenueImpact },
    { label: "cost saving potential", value: input.costSaving },
    { label: "user impact", value: input.userImpact },
    { label: "regulatory urgency", value: input.regulatoryUrgency },
  ];

  const strongestValue = [...valueSignals].sort(
    (a, b) => levelToScore(b.value) - levelToScore(a.value)
  )[0];

  if (levelToScore(strongestValue.value) >= 3) {
    reasons.push(
      `The opportunity has strong ${strongestValue.label}, which materially strengthens the business case.`
    );
  } else if (levelToScore(strongestValue.value) === 2) {
    reasons.push(
      `The opportunity shows moderate ${strongestValue.label}, so it may be worth pursuing with a focused scope.`
    );
  } else {
    reasons.push(
      "The current value signals look limited, so the case for investment is not yet very strong."
    );
  }

  if (input.effort <= 3 && input.dependencyComplexity === "Low") {
    reasons.push(
      "Delivery effort and dependency complexity are both relatively low, which supports faster execution."
    );
  } else if (input.effort <= 6 && input.dependencyComplexity !== "High") {
    reasons.push(
      "The feature looks feasible with manageable delivery trade-offs, but scope discipline will still matter."
    );
  } else {
    reasons.push(
      "Execution complexity is meaningful due to higher effort or dependencies, which increases delivery risk."
    );
  }

  if (input.confidence >= 4) {
    reasons.push("Confidence is strong enough to support a near-term decision.");
  } else if (input.confidence === 3) {
    reasons.push("Confidence is moderate, so targeted validation is still needed.");
  } else {
    reasons.push("Confidence is low, so more evidence is needed before committing materially.");
  }

  let nextStep = "Validate scope, define success metrics, and align on a lean first release.";

  if (result.recommendation === "BUILD") {
    nextStep =
      "Move into MVP planning, confirm the first release scope, and align on success metrics and ownership.";
  } else if (result.recommendation === "DELAY") {
    nextStep =
      "Run lightweight validation first: tighten the scope, test demand, and reduce uncertainty before building.";
  } else {
    nextStep =
      "Deprioritize for now and revisit only if the business case, urgency, or supporting evidence changes materially.";
  }

  let confidenceLift = "Sharpen the evidence base with user validation and clearer success criteria.";

  if (input.confidence <= 2) {
    confidenceLift =
      "Interview target users, define the exact operational pain point, and validate a measurable outcome.";
  } else if (input.dependencyComplexity === "High") {
    confidenceLift =
      "Break the idea into a smaller MVP and validate the first release without downstream dependencies.";
  } else if (input.riskLevel === "High") {
    confidenceLift =
      "Reduce implementation and adoption risk through a tighter pilot, staged rollout, or narrower first use case.";
  }

  const topRisk = getTopRisk(result.risks);

  return {
    reasons: reasons.slice(0, 3),
    biggestRisk: topRisk?.item || "No major risk flagged yet.",
    confidenceLift,
    nextStep,
  };
}

function getValueScore(input: DecisionInput) {
  return (
    levelToScore(input.revenueImpact) +
    levelToScore(input.costSaving) +
    levelToScore(input.userImpact) +
    levelToScore(input.regulatoryUrgency)
  );
}

function getFeasibilityScore(input: DecisionInput) {
  const effortScore = 11 - input.effort;
  const dependencyScore = 4 - levelToScore(input.dependencyComplexity);
  const riskScore = 4 - levelToScore(input.riskLevel);
  return effortScore + dependencyScore + riskScore;
}

export default function Home() {
  const [view, setView] = useState<"create" | "dashboard" | "rankings">("create");

  const [input, setInput] = useState<DecisionInput>(defaultDecisionInput());

  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [result, setResult] = useState<DecisionResult | null>(null);

  const [saved, setSaved] = useState<SavedDecision[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "score">("recent");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SavedDecision[];
        setSaved(
          parsed.map((item) => ({
            ...item,
            input: normalizeDecisionInput(item.input as Partial<DecisionInput> & Record<string, unknown>),
          }))
        );
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // ignore
    }
  }, [saved]);

  const filteredSaved = useMemo(() => {
    const q = query.trim().toLowerCase();

    const list = saved.filter((d) => {
      if (!q) return true;
      const t =
        `${d.input.featureName} ${d.input.strategicGoal} ${d.input.description} ` +
        `${d.input.revenueImpact} ${d.input.costSaving} ${d.input.userImpact} ` +
        `${d.input.regulatoryUrgency} ${d.input.evidence ?? ""}`.toLowerCase();
      return t.includes(q);
    });

    list.sort((a, b) => {
      if (sortBy === "score") return b.output.score - a.output.score;
      return b.createdAt - a.createdAt;
    });

    return list;
  }, [saved, query, sortBy]);

  const activeDecision = useMemo(() => {
    if (!activeId) return null;
    return saved.find((d) => d.id === activeId) ?? null;
  }, [activeId, saved]);

  async function generateDecision() {
    setLoading(true);
    setApiError(null);
    setResult(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text);

      const data = JSON.parse(text) as DecisionResult;
      setResult(data);
      setView("dashboard");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Something went wrong";
      setApiError(message);
    } finally {
      setLoading(false);
    }
  }

  function saveCurrent() {
    if (!result) return;

    const newItem: SavedDecision = {
      id: uid(),
      createdAt: Date.now(),
      input: { ...input },
      output: result,
    };

    setSaved((prev) => [newItem, ...prev]);
    setActiveId(newItem.id);
  }

  function openSaved(item: SavedDecision) {
    setActiveId(item.id);
    setInput({ ...item.input });
    setResult({ ...item.output });
    setView("dashboard");
  }

  function deleteSaved(id: string) {
    setSaved((prev) => prev.filter((x) => x.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function resetToNew() {
    setActiveId(null);
    setResult(null);
    setApiError(null);
    setInput(defaultDecisionInput());
    setView("create");
  }

  const rankings = useMemo(() => {
    return [...saved].sort((a, b) => b.output.score - a.output.score);
  }, [saved]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black font-bold text-white">
              D
            </div>
            <div>
              <div className="text-sm font-semibold leading-4">DecisionLayer</div>
              <div className="text-xs text-slate-500">Structured Product Decision Engine</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                view === "create" ? "bg-slate-900 text-white" : "border bg-white"
              }`}
              onClick={() => setView("create")}
            >
              New Decision
            </button>
            <button
              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                view === "dashboard" ? "bg-slate-900 text-white" : "border bg-white"
              }`}
              onClick={() => setView("dashboard")}
              disabled={!result && !activeDecision}
              title={!result && !activeDecision ? "Generate or open a saved decision first" : ""}
            >
              Dashboard
            </button>
            <button
              className={`rounded-xl px-3 py-2 text-sm font-medium ${
                view === "rankings" ? "bg-slate-900 text-white" : "border bg-white"
              }`}
              onClick={() => setView("rankings")}
            >
              Rankings
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-6 md:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Saved Decisions</div>
            <div className="text-xs text-slate-500">{saved.length}</div>
          </div>

          <div className="mt-3 space-y-2">
            <input
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              placeholder="Search saved decisions..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium ${
                  sortBy === "recent" ? "border-slate-900 bg-slate-900 text-white" : "bg-white"
                }`}
                onClick={() => setSortBy("recent")}
              >
                Recent
              </button>
              <button
                className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium ${
                  sortBy === "score" ? "border-slate-900 bg-slate-900 text-white" : "bg-white"
                }`}
                onClick={() => setSortBy("score")}
              >
                Top Score
              </button>
            </div>
          </div>

          <div className="mt-4 max-h-[65vh] space-y-2 overflow-auto pr-1">
            {filteredSaved.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-slate-500">
                No saved decisions yet. Generate a decision and click <b>Save</b>.
              </div>
            ) : (
              filteredSaved.map((d) => (
                <div
                  key={d.id}
                  className={`group cursor-pointer rounded-xl border p-3 hover:bg-slate-50 ${
                    d.id === activeId ? "border-slate-900" : ""
                  }`}
                  onClick={() => openSaved(d)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{d.input.featureName}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border px-2 py-0.5 text-[11px] text-slate-600">
                          {d.input.strategicGoal}
                        </span>
                        <span className="rounded-full border px-2 py-0.5 text-[11px] text-slate-600">
                          Rev: {d.input.revenueImpact}
                        </span>
                        <span className="rounded-full border px-2 py-0.5 text-[11px] text-slate-600">
                          Urgency: {d.input.regulatoryUrgency}
                        </span>
                        <span className="rounded-full border px-2 py-0.5 text-[11px] text-slate-600">
                          Effort: {d.input.effort}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-bold">{d.output.score}</div>
                      <div className="mt-1">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[11px] ${recBadge(
                            d.output.recommendation
                          )}`}
                        >
                          {d.output.recommendation}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-xs text-slate-500">
                      {new Date(d.createdAt).toLocaleString()}
                    </div>
                    <button
                      className="text-xs text-red-600 opacity-0 hover:underline group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSaved(d.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
              onClick={resetToNew}
            >
              Clear
            </button>
            <button
              className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
              onClick={() => setView("rankings")}
            >
              View Rankings
            </button>
          </div>
        </aside>

        <section className="space-y-4">
          {view === "create" && (
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">Evaluate a product decision</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    A structured tool to help product teams evaluate ideas using value, urgency,
                    feasibility, confidence, and AI-assisted analysis.
                  </p>
                </div>
                <div className="rounded-2xl border bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  Tip: Keep the description focused on the problem, user, and outcome.
                </div>
              </div>

              <div className="mt-6 grid gap-6">
                <div>
                  <label className="text-sm font-medium">Feature name</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                    value={input.featureName}
                    onChange={(e) => setInput((p) => ({ ...p, featureName: e.target.value }))}
                    placeholder="e.g., AI-powered reconciliation break resolution engine"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                    rows={5}
                    value={input.description}
                    onChange={(e) => setInput((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Describe the problem, who it serves, the workflow gap, and the outcome it should drive."
                  />
                </div>

                <SectionTitle
                  title="Strategic context"
                  subtitle="Anchor the opportunity to the business objective."
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Strategic goal</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      value={input.strategicGoal}
                      onChange={(e) =>
                        setInput((p) => ({
                          ...p,
                          strategicGoal: e.target.value as StrategicGoal,
                        }))
                      }
                    >
                      <option>Revenue</option>
                      <option>Retention</option>
                      <option>Compliance</option>
                      <option>Efficiency</option>
                      <option>Customer Experience</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Regulatory urgency</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      value={input.regulatoryUrgency}
                      onChange={(e) =>
                        setInput((p) => ({
                          ...p,
                          regulatoryUrgency: e.target.value as UrgencyLevel,
                        }))
                      }
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Critical</option>
                    </select>
                  </div>
                </div>

                <SectionTitle
                  title="Value drivers"
                  subtitle="Capture the business value across revenue, savings, and user impact."
                />
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium">Revenue impact</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      value={input.revenueImpact}
                      onChange={(e) =>
                        setInput((p) => ({
                          ...p,
                          revenueImpact: e.target.value as ImpactLevel,
                        }))
                      }
                    >
                      <option>None</option>
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Cost saving potential</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      value={input.costSaving}
                      onChange={(e) =>
                        setInput((p) => ({
                          ...p,
                          costSaving: e.target.value as ImpactLevel,
                        }))
                      }
                    >
                      <option>None</option>
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">User / customer impact</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      value={input.userImpact}
                      onChange={(e) =>
                        setInput((p) => ({
                          ...p,
                          userImpact: e.target.value as StandardLevel,
                        }))
                      }
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                    </select>
                  </div>
                </div>

                <SectionTitle
                  title="Delivery feasibility"
                  subtitle="Reflect complexity, timing pressure, delivery effort, and risk."
                />
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium">Time sensitivity</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      value={input.timeSensitivity}
                      onChange={(e) =>
                        setInput((p) => ({
                          ...p,
                          timeSensitivity: e.target.value as StandardLevel,
                        }))
                      }
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Dependency complexity</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      value={input.dependencyComplexity}
                      onChange={(e) =>
                        setInput((p) => ({
                          ...p,
                          dependencyComplexity: e.target.value as StandardLevel,
                        }))
                      }
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Risk level</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      value={input.riskLevel}
                      onChange={(e) =>
                        setInput((p) => ({
                          ...p,
                          riskLevel: e.target.value as StandardLevel,
                        }))
                      }
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Effort (1–10)</label>
                    <input
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      type="number"
                      min={1}
                      max={10}
                      value={input.effort}
                      onChange={(e) =>
                        setInput((p) => ({
                          ...p,
                          effort: Number(e.target.value),
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Confidence (1–5)</label>
                    <input
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      type="number"
                      min={1}
                      max={5}
                      value={input.confidence}
                      onChange={(e) =>
                        setInput((p) => ({
                          ...p,
                          confidence: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>

                <SectionTitle
                  title="Supporting inputs"
                  subtitle="Optional fields to improve explainability and recommendation quality."
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Assumptions</label>
                    <textarea
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      rows={4}
                      value={input.assumptions ?? ""}
                      onChange={(e) => setInput((p) => ({ ...p, assumptions: e.target.value }))}
                      placeholder="List key assumptions, dependencies, or scope boundaries."
                    />
                  </div>

                  <div>
                    <label className="text-sm font-medium">Evidence / supporting data</label>
                    <textarea
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      rows={4}
                      value={input.evidence ?? ""}
                      onChange={(e) => setInput((p) => ({ ...p, evidence: e.target.value }))}
                      placeholder="User feedback, operational pain points, client asks, metrics, or regulatory drivers."
                    />
                  </div>
                </div>

                <div className="flex items-end gap-2">
                  <button
                    className="w-full rounded-xl bg-slate-900 px-5 py-3 font-medium text-white hover:bg-black disabled:opacity-60"
                    onClick={generateDecision}
                    disabled={loading}
                  >
                    {loading ? "Generating…" : "Generate Dashboard"}
                  </button>
                </div>

                {apiError && (
                  <div className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {apiError}
                  </div>
                )}
              </div>
            </div>
          )}

          {view === "dashboard" && (
            <Dashboard
              input={activeDecision?.input ?? input}
              result={activeDecision?.output ?? result}
              onSave={saveCurrent}
              canSave={!!result}
              onGoRankings={() => setView("rankings")}
              onNew={resetToNew}
            />
          )}

          {view === "rankings" && (
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">Rankings</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Saved decisions ordered by score, from strongest opportunity to weakest.
                  </p>
                </div>
                <button
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
                  onClick={() => setView("create")}
                >
                  New Decision
                </button>
              </div>

              <div className="mt-6 overflow-auto rounded-2xl border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left">Feature</th>
                      <th className="px-4 py-3 text-left">Goal</th>
                      <th className="px-4 py-3 text-left">Value</th>
                      <th className="px-4 py-3 text-left">Feasibility</th>
                      <th className="px-4 py-3 text-left">Score</th>
                      <th className="px-4 py-3 text-left">Recommendation</th>
                      <th className="px-4 py-3 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankings.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-slate-500" colSpan={7}>
                          No saved decisions yet.
                        </td>
                      </tr>
                    ) : (
                      rankings.map((d) => (
                        <tr key={d.id} className="border-t">
                          <td className="px-4 py-3 font-semibold">{d.input.featureName}</td>
                          <td className="px-4 py-3">{d.input.strategicGoal}</td>
                          <td className="px-4 py-3">{getValueScore(d.input)}</td>
                          <td className="px-4 py-3">{getFeasibilityScore(d.input)}</td>
                          <td className="px-4 py-3 font-bold">{d.output.score}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-[11px] ${recBadge(
                                d.output.recommendation
                              )}`}
                            >
                              {d.output.recommendation}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {new Date(d.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Dashboard({
  input,
  result,
  onSave,
  canSave,
  onGoRankings,
  onNew,
}: {
  input: DecisionInput;
  result: DecisionResult | null;
  onSave: () => void;
  canSave: boolean;
  onGoRankings: () => void;
  onNew: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!result) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">Dashboard</h2>
        <p className="mt-2 text-sm text-slate-500">
          Generate a decision or open one from Saved Decisions.
        </p>
        <button
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
          onClick={onNew}
        >
          New Decision
        </button>
      </div>
    );
  }

  const summary = getDecisionSummary(input, result);
  const safeResult = result;

  async function copySnapshot() {
    const snapshot = `DecisionLayer Snapshot

Feature: ${input.featureName}
Strategic goal: ${input.strategicGoal}
Revenue impact: ${input.revenueImpact}
Cost saving: ${input.costSaving}
User impact: ${input.userImpact}
Regulatory urgency: ${input.regulatoryUrgency}
Time sensitivity: ${input.timeSensitivity}
Dependency complexity: ${input.dependencyComplexity}
Effort: ${input.effort}
Confidence: ${input.confidence}
Risk level: ${input.riskLevel}

Value score: ${getValueScore(input)}
Feasibility score: ${getFeasibilityScore(input)}

Score: ${safeResult.score}
Recommendation: ${safeResult.recommendation}

Why this decision:
- ${summary.reasons.join("\n- ")}

Biggest risk:
${summary.biggestRisk}

What would increase confidence:
${summary.confidenceLift}

Recommended next step:
${summary.nextStep}

Assumptions:
${input.assumptions || "—"}

Evidence:
${input.evidence || "—"}`;

    try {
      await navigator.clipboard.writeText(snapshot);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs text-slate-500">Feature</div>
            <h2 className="text-2xl font-bold">{input.featureName}</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">{input.description}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <span className={neutralBadge()}>
                Goal: <b>{input.strategicGoal}</b>
              </span>
              <span className={neutralBadge()}>
                Rev: <b>{input.revenueImpact}</b>
              </span>
              <span className={neutralBadge()}>
                Cost save: <b>{input.costSaving}</b>
              </span>
              <span className={neutralBadge()}>
                User impact: <b>{input.userImpact}</b>
              </span>
              <span className={neutralBadge()}>
                Urgency: <b>{input.regulatoryUrgency}</b>
              </span>
              <span className={neutralBadge()}>
                Dependencies: <b>{input.dependencyComplexity}</b>
              </span>
              <span className={neutralBadge()}>
                Effort: <b>{input.effort}</b>
              </span>
              <span className={neutralBadge()}>
                Confidence: <b>{input.confidence}</b>
              </span>
              <span className={neutralBadge()}>
                Risk: <b>{input.riskLevel}</b>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              onClick={onNew}
            >
              New
            </button>
            <button
              className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              onClick={onGoRankings}
            >
              Rankings
            </button>
            <button
              className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              onClick={copySnapshot}
            >
              {copied ? "Copied" : "Copy Snapshot"}
            </button>
            <button
              className={`rounded-xl px-4 py-2 text-sm font-medium ${
                canSave ? "bg-slate-900 text-white hover:bg-black" : "bg-slate-200 text-slate-500"
              }`}
              onClick={onSave}
              disabled={!canSave}
              title={
                !canSave
                  ? "Open a saved decision from the sidebar, or generate a new one to save."
                  : ""
              }
            >
              Save
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Score</div>
          <div className="mt-2 text-4xl font-extrabold tracking-tight">{result.score}</div>
          <div className="mt-2 text-xs text-slate-500">
            Baseline: <b>{result.baseRecommendation}</b>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Value score</div>
          <div className="mt-2 text-4xl font-extrabold tracking-tight">{getValueScore(input)}</div>
          <div className="mt-2 text-xs text-slate-500">Revenue + savings + user + urgency</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Feasibility score</div>
          <div className="mt-2 text-4xl font-extrabold tracking-tight">
            {getFeasibilityScore(input)}
          </div>
          <div className="mt-2 text-xs text-slate-500">Effort + dependencies + risk</div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">Recommendation</div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${recBadge(
                result.recommendation
              )}`}
            >
              {result.recommendation}
            </span>
          </div>
          <div className="mt-3 text-sm text-slate-700">{result.rationale}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Decision Summary" subtitle="A quick explanation of the recommendation.">
          <div className="grid gap-3">
            <SummaryBox
              label="Recommended action"
              value={result.recommendation}
              tone={result.recommendation}
            />
            <SummaryList label="Why this decision?" items={summary.reasons} />
            <SummaryText label="Biggest risk" value={summary.biggestRisk} />
            <SummaryText label="What would increase confidence?" value={summary.confidenceLift} />
            <SummaryText label="Recommended next step" value={summary.nextStep} />
          </div>
        </Card>

        <Card title="Input Drivers" subtitle="The key inputs shaping the recommendation.">
          <div className="flex flex-wrap gap-2">
            <MetricBadge label="Strategic goal" value={input.strategicGoal} />
            <MetricBadge label="Revenue impact" value={input.revenueImpact} />
            <MetricBadge label="Cost saving" value={input.costSaving} />
            <MetricBadge label="User impact" value={input.userImpact} />
            <MetricBadge label="Regulatory urgency" value={input.regulatoryUrgency} />
            <MetricBadge label="Time sensitivity" value={input.timeSensitivity} />
            <MetricBadge label="Dependency complexity" value={input.dependencyComplexity} />
            <MetricBadge label="Risk level" value={input.riskLevel} />
            <MetricBadge label="Effort" value={String(input.effort)} />
            <MetricBadge label="Confidence" value={String(input.confidence)} />
          </div>
        </Card>

        <Card title="Assumptions" subtitle="What must be true for this to work.">
          <Bullets items={result.assumptions} />
          {input.assumptions?.trim() && (
            <div className="mt-4 rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Input assumptions
              </div>
              <div className="mt-1 whitespace-pre-wrap">{input.assumptions}</div>
            </div>
          )}
        </Card>

        <Card title="Evidence" subtitle="Supporting context behind the business case.">
          <div className="text-sm text-slate-700 whitespace-pre-wrap">
            {input.evidence?.trim() || "—"}
          </div>
        </Card>

        <Card title="Risks" subtitle="What could fail or slow adoption.">
          <div className="space-y-2">
            {(result.risks || []).map((r, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 rounded-xl border p-3"
              >
                <div className="text-sm text-slate-800">{r.item}</div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium ${severityBadge(
                    r.severity
                  )}`}
                >
                  {r.severity}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Open Questions" subtitle="What to validate before committing.">
          <Bullets items={result.questions} />
        </Card>

        <Card title="Success Metrics" subtitle="How you’ll know it worked.">
          <Bullets items={result.metrics} />
        </Card>

        <Card title="MVP Scope (IN)" subtitle="What to include in the first release.">
          <Bullets items={result.mvp_scope?.in || []} />
        </Card>

        <Card title="MVP Scope (OUT)" subtitle="What to explicitly exclude for speed.">
          <Bullets items={result.mvp_scope?.out || []} />
        </Card>

        <Card title="User Stories (Top)" subtitle="High-priority stories for the first pass.">
          <div className="space-y-3">
            {(result.user_stories || []).slice(0, 6).map((s, i) => (
              <div key={i} className="rounded-2xl border p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{s.title}</div>
                  <span className="rounded-full border bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                    {s.priority}
                  </span>
                </div>
                <div className="mt-2 text-sm text-slate-700">{s.story}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
    </div>
  );
}

function MetricBadge({ label, value }: { label: string; value: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${labelTone(
        value
      )}`}
    >
      <span className="opacity-80">{label}:</span>
      <b>{value}</b>
    </span>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (!items || items.length === 0) return <div className="text-sm text-slate-500">—</div>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function SummaryBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "BUILD" | "DELAY" | "KILL";
}) {
  const toneClass =
    tone === "BUILD"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "DELAY"
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : "border-red-200 bg-red-50 text-red-700";

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function SummaryText({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm text-slate-700">{value}</div>
    </div>
  );
}

function SummaryList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {items.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
"use client";

import { useEffect, useMemo, useState } from "react";

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

type DecisionInput = {
  featureName: string;
  description: string;
  goal: string;
  impact: "Low" | "Medium" | "High";
  effort: number; // 1-10
  confidence: number; // 1-5
};

type SavedDecision = {
  id: string;
  createdAt: number;
  input: DecisionInput;
  output: DecisionResult;
};

const STORAGE_KEY = "decision_engine_saved_v1";

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

function getTopRisk(risks: Risk[]) {
  if (!risks?.length) return null;
  return (
    risks.find((r) => r.severity === "high") ||
    risks.find((r) => r.severity === "medium") ||
    risks[0]
  );
}

function getDecisionSummary(input: DecisionInput, result: DecisionResult) {
  const reasons: string[] = [];

  if (input.impact === "High") reasons.push("The opportunity has high potential business impact.");
  if (input.impact === "Medium") reasons.push("The opportunity has moderate expected business impact.");
  if (input.impact === "Low") reasons.push("The opportunity currently looks low impact.");

  if (input.effort <= 3) reasons.push("Implementation effort is relatively low, which supports faster execution.");
  else if (input.effort <= 6) reasons.push("Implementation effort is manageable but still needs trade-off planning.");
  else reasons.push("Implementation effort is high, which increases delivery risk and slows time to value.");

  if (input.confidence >= 4) reasons.push("Confidence is strong enough to support a near-term product decision.");
  else if (input.confidence === 3) reasons.push("Confidence is moderate, so some validation is still needed.");
  else reasons.push("Confidence is low, so more validation is needed before committing heavily.");

  let nextStep = "Validate scope, define success metrics, and align on a lean first release.";
  if (result.recommendation === "BUILD") {
    nextStep = "Move into MVP planning, define the smallest shippable scope, and confirm success metrics.";
  } else if (result.recommendation === "DELAY") {
    nextStep = "Run lightweight validation first: clarify scope, test demand, and reduce uncertainty before building.";
  } else if (result.recommendation === "KILL") {
    nextStep = "Deprioritize for now and revisit only if the strategic value or user evidence changes materially.";
  }

  let confidenceLift = "Gather a small round of user validation and sharpen the success metric.";
  if (input.confidence <= 2) {
    confidenceLift = "Interview 5–7 target users, define the exact problem, and confirm a measurable outcome.";
  } else if (input.effort >= 7) {
    confidenceLift = "Break the feature into a smaller MVP and estimate the first release separately.";
  } else if (input.impact === "Low") {
    confidenceLift = "Validate whether this meaningfully changes adoption, retention, or revenue before investing.";
  }

  const topRisk = getTopRisk(result.risks);

  return {
    reasons: reasons.slice(0, 3),
    biggestRisk: topRisk?.item || "No major risk flagged yet.",
    confidenceLift,
    nextStep,
  };
}

export default function Home() {
  const [view, setView] = useState<"create" | "dashboard" | "rankings">("create");

  const [input, setInput] = useState<DecisionInput>({
    featureName: "",
    description: "",
    goal: "Growth",
    impact: "Medium",
    effort: 5,
    confidence: 3,
  });

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
      if (raw) setSaved(JSON.parse(raw));
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
    let list = saved.filter((d) => {
      if (!q) return true;
      const t =
        `${d.input.featureName} ${d.input.goal} ${d.input.description}`.toLowerCase();
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
    } catch (e: any) {
      setApiError(e?.message || "Something went wrong");
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
    setInput({
      featureName: "",
      description: "",
      goal: "Growth",
      impact: "Medium",
      effort: 5,
      confidence: 3,
    });
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
              <div className="text-xs text-slate-500">AI Product Decision Engine</div>
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
                          {d.input.goal}
                        </span>
                        <span className="rounded-full border px-2 py-0.5 text-[11px] text-slate-600">
                          Impact: {d.input.impact}
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
                  <h2 className="text-xl font-bold">Create a decision</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    A lightweight tool to help product teams evaluate ideas using impact,
                    effort, confidence, and AI-assisted analysis.
                  </p>
                </div>
                <div className="rounded-2xl border bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  Tip: Keep the description to 3–6 lines for the clearest output.
                </div>
              </div>

              <div className="mt-6 grid gap-4">
                <div>
                  <label className="text-sm font-medium">Feature name</label>
                  <input
                    className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                    value={input.featureName}
                    onChange={(e) => setInput((p) => ({ ...p, featureName: e.target.value }))}
                    placeholder="e.g., AI-powered discrepancy detection engine"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                    rows={5}
                    value={input.description}
                    onChange={(e) => setInput((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Describe the feature, who it serves, the user problem, and the outcome it should drive."
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium">Primary goal</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      value={input.goal}
                      onChange={(e) => setInput((p) => ({ ...p, goal: e.target.value }))}
                    >
                      <option>Revenue</option>
                      <option>Growth</option>
                      <option>Retention</option>
                      <option>Enterprise</option>
                      <option>Tech debt</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Impact</label>
                    <select
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      value={input.impact}
                      onChange={(e) => setInput((p) => ({ ...p, impact: e.target.value as any }))}
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Effort (1–10)</label>
                    <input
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      type="number"
                      min={1}
                      max={10}
                      value={input.effort}
                      onChange={(e) => setInput((p) => ({ ...p, effort: Number(e.target.value) }))}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="text-sm font-medium">Confidence (1–5)</label>
                    <input
                      className="mt-1 w-full rounded-xl border px-4 py-3 outline-none focus:ring-2 focus:ring-slate-200"
                      type="number"
                      min={1}
                      max={5}
                      value={input.confidence}
                      onChange={(e) =>
                        setInput((p) => ({ ...p, confidence: Number(e.target.value) }))
                      }
                    />
                  </div>

                  <div className="flex items-end gap-2 md:col-span-2">
                    <button
                      className="w-full rounded-xl bg-slate-900 px-5 py-3 font-medium text-white hover:bg-black disabled:opacity-60"
                      onClick={generateDecision}
                      disabled={loading}
                    >
                      {loading ? "Generating…" : "Generate Dashboard"}
                    </button>
                  </div>
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
                      <th className="px-4 py-3 text-left">Score</th>
                      <th className="px-4 py-3 text-left">Recommendation</th>
                      <th className="px-4 py-3 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankings.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-slate-500" colSpan={5}>
                          No saved decisions yet.
                        </td>
                      </tr>
                    ) : (
                      rankings.map((d) => (
                        <tr key={d.id} className="border-t">
                          <td className="px-4 py-3 font-semibold">{d.input.featureName}</td>
                          <td className="px-4 py-3">{d.input.goal}</td>
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

              <div className="mt-4 text-xs text-slate-500">
                Next iteration idea: add “Compare top 3” for a side-by-side decision view.
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

  async function copySnapshot() {
    const snapshot = `DecisionLayer Snapshot

Feature: ${input.featureName}
Goal: ${input.goal}
Impact: ${input.impact}
Effort: ${input.effort}
Confidence: ${input.confidence}

Score: ${result.score}
Recommendation: ${result.recommendation}

Why this decision:
- ${summary.reasons.join("\n- ")}

Biggest risk:
${summary.biggestRisk}

What would increase confidence:
${summary.confidenceLift}

Recommended next step:
${summary.nextStep}`;

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
              <span className="rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-700">
                Goal: <b>{input.goal}</b>
              </span>
              <span className="rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-700">
                Impact: <b>{input.impact}</b>
              </span>
              <span className="rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-700">
                Effort: <b>{input.effort}</b>
              </span>
              <span className="rounded-full border bg-slate-50 px-3 py-1 text-xs text-slate-700">
                Confidence: <b>{input.confidence}</b>
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

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="text-xs text-slate-500">Score</div>
          <div className="mt-2 text-4xl font-extrabold tracking-tight">{result.score}</div>
          <div className="mt-2 text-xs text-slate-500">
            Baseline: <b>{result.baseRecommendation}</b>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm md:col-span-2">
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

        <Card title="Assumptions" subtitle="What must be true for this to work.">
          <Bullets items={result.assumptions} />
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

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
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
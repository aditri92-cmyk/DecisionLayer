import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Recommendation = "BUILD" | "DELAY" | "KILL";
type Severity = "low" | "medium" | "high";

type UserStory = {
  title: string;
  story: string;
  priority: "P0" | "P1" | "P2";
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function unique<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function uniqueObjects<T>(arr: T[]) {
  return unique(arr.map((x) => JSON.stringify(x))).map((x) => JSON.parse(x) as T);
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

function parseBody(body: any): DecisionInput {
  return {
    featureName: (body.featureName ?? "").toString().trim(),
    description: (body.description ?? "").toString().trim(),
    strategicGoal: ((body.strategicGoal ?? "Revenue").toString().trim() ||
      "Revenue") as StrategicGoal,
    revenueImpact: ((body.revenueImpact ?? "Medium").toString().trim() ||
      "Medium") as ImpactLevel,
    costSaving: ((body.costSaving ?? "Medium").toString().trim() ||
      "Medium") as ImpactLevel,
    userImpact: ((body.userImpact ?? "Medium").toString().trim() ||
      "Medium") as StandardLevel,
    regulatoryUrgency: ((body.regulatoryUrgency ?? "Medium").toString().trim() ||
      "Medium") as UrgencyLevel,
    timeSensitivity: ((body.timeSensitivity ?? "Medium").toString().trim() ||
      "Medium") as StandardLevel,
    dependencyComplexity: ((body.dependencyComplexity ?? "Medium").toString().trim() ||
      "Medium") as StandardLevel,
    effort: clamp(Number(body.effort ?? 5), 1, 10),
    confidence: clamp(Number(body.confidence ?? 3), 1, 5),
    riskLevel: ((body.riskLevel ?? "Medium").toString().trim() ||
      "Medium") as StandardLevel,
    assumptions: (body.assumptions ?? "").toString().trim(),
    evidence: (body.evidence ?? "").toString().trim(),
  };
}

function getValueScore(input: DecisionInput) {
  const revenue = levelToScore(input.revenueImpact) * 2.0;
  const costSaving = levelToScore(input.costSaving) * 1.5;
  const userImpact = levelToScore(input.userImpact) * 1.5;
  const urgency = levelToScore(input.regulatoryUrgency) * 2.0;
  const timeSensitivity = levelToScore(input.timeSensitivity) * 1.0;

  return revenue + costSaving + userImpact + urgency + timeSensitivity;
}

function getFeasibilityScore(input: DecisionInput) {
  const effortScore = 11 - input.effort;
  const dependencyScore = 4 - levelToScore(input.dependencyComplexity);
  const riskScore = 4 - levelToScore(input.riskLevel);

  return effortScore + dependencyScore + riskScore;
}

function getConfidenceMultiplier(confidence: number) {
  const map: Record<number, number> = {
    1: 0.72,
    2: 0.84,
    3: 0.93,
    4: 1.0,
    5: 1.06,
  };
  return map[confidence] ?? 0.93;
}

function getBaseRecommendation(score: number): Recommendation {
  if (score >= 68) return "BUILD";
  if (score >= 42) return "DELAY";
  return "KILL";
}

function getRecommendation(
  input: DecisionInput,
  score: number,
  valueScore: number,
  feasibilityScore: number
): Recommendation {
  const highValue =
    levelToScore(input.revenueImpact) >= 3 ||
    levelToScore(input.costSaving) >= 3 ||
    levelToScore(input.userImpact) >= 3 ||
    levelToScore(input.regulatoryUrgency) >= 3;

  const veryHighUrgency = input.regulatoryUrgency === "Critical";
  const hardToDeliver =
    input.effort >= 8 ||
    input.dependencyComplexity === "High" ||
    input.riskLevel === "High";

  if (veryHighUrgency && input.confidence >= 3 && score >= 55) return "BUILD";

  if (
    highValue &&
    input.confidence >= 4 &&
    input.effort <= 6 &&
    input.dependencyComplexity !== "High" &&
    input.riskLevel !== "High"
  ) {
    return "BUILD";
  }

  if (
    valueScore <= 6 &&
    input.confidence <= 2 &&
    (input.riskLevel === "High" || input.effort >= 7)
  ) {
    return "KILL";
  }

  if (
    hardToDeliver &&
    valueScore >= 8 &&
    input.confidence >= 2 &&
    feasibilityScore >= 2
  ) {
    return "DELAY";
  }

  if (score >= 68) return "BUILD";
  if (score >= 42) return "DELAY";
  return "KILL";
}

function buildRationale(
  recommendation: Recommendation,
  score: number,
  valueScore: number,
  feasibilityScore: number,
  input: DecisionInput
) {
  const parts: string[] = [];

  if (valueScore >= 14) {
    parts.push(
      "The opportunity shows strong overall value based on the combined revenue, cost saving, user impact, and urgency signals."
    );
  } else if (valueScore >= 9) {
    parts.push(
      "The opportunity shows moderate value, with some meaningful upside but not enough to justify a broad commitment without control."
    );
  } else {
    parts.push(
      "The current value case looks limited, so the idea needs a stronger business justification before investment."
    );
  }

  if (feasibilityScore >= 9) {
    parts.push(
      "Execution looks relatively feasible because effort, dependencies, and delivery risk appear manageable."
    );
  } else if (feasibilityScore >= 6) {
    parts.push(
      "Execution looks possible but will require disciplined scoping and active dependency management."
    );
  } else {
    parts.push(
      "Execution complexity is meaningful due to higher effort, dependencies, or risk, which reduces near-term feasibility."
    );
  }

  if (input.confidence >= 4) {
    parts.push("Confidence is strong enough to support a more assertive near-term decision.");
  } else if (input.confidence === 3) {
    parts.push("Confidence is moderate, so targeted validation is still needed.");
  } else {
    parts.push("Confidence is low, which suggests validating assumptions before committing materially.");
  }

  if (input.regulatoryUrgency === "Critical") {
    parts.push(
      "Regulatory urgency is critical, which increases the pressure to act even if the solution needs to start with a tightly scoped first release."
    );
  } else if (input.regulatoryUrgency === "High") {
    parts.push("Regulatory urgency is high, which strengthens the case for prioritization.");
  }

  const ending =
    recommendation === "BUILD"
      ? `Overall, this supports a BUILD recommendation in service of the ${input.strategicGoal.toLowerCase()} objective.`
      : recommendation === "DELAY"
      ? "Overall, this is better treated as a DELAY decision until uncertainty or delivery complexity is reduced."
      : "Overall, this does not justify near-term investment and is better deprioritized for now.";

  return `${parts.join(" ")} ${ending} Current score: ${score}.`;
}

function buildAssumptions(input: DecisionInput) {
  const assumptions = [
    `The problem addressed by ${input.featureName} is important enough to influence the ${input.strategicGoal.toLowerCase()} objective.`,
    "The first release can be scoped tightly enough to deliver value without unnecessary complexity.",
    "Users or stakeholders will understand the value proposition without heavy change management in the first iteration.",
  ];

  if (levelToScore(input.revenueImpact) >= 3) {
    assumptions.push("The opportunity can influence commercial outcomes in a measurable way if executed well.");
  }

  if (levelToScore(input.costSaving) >= 3) {
    assumptions.push("The solution can reduce manual effort or operational overhead in a measurable way.");
  }

  if (input.confidence <= 2) {
    assumptions.push("Current evidence is not yet strong enough to validate demand or impact with high certainty.");
  } else {
    assumptions.push("Existing signals are directionally strong enough to justify a structured first release.");
  }

  if (input.assumptions) {
    assumptions.push(input.assumptions);
  }

  return unique(assumptions).slice(0, 5);
}

function buildRisks(input: DecisionInput) {
  const risks: { item: string; severity: Severity }[] = [];

  if (input.effort >= 8) {
    risks.push({
      item: "Implementation scope may expand beyond the first release and delay delivery materially.",
      severity: "high",
    });
  } else if (input.effort >= 6) {
    risks.push({
      item: "Delivery may take longer than expected unless the first release is tightly scoped.",
      severity: "medium",
    });
  }

  if (input.dependencyComplexity === "High") {
    risks.push({
      item: "Cross-team or upstream dependencies could slow execution and create coordination risk.",
      severity: "high",
    });
  } else if (input.dependencyComplexity === "Medium") {
    risks.push({
      item: "Some dependencies may affect timeline reliability if they are not addressed early.",
      severity: "medium",
    });
  }

  if (input.riskLevel === "High") {
    risks.push({
      item: "Delivery or adoption risk is high enough that a full-scale rollout may be premature.",
      severity: "high",
    });
  }

  if (input.confidence <= 2) {
    risks.push({
      item: "The team may be solving an under-validated problem with insufficient user or business evidence.",
      severity: "high",
    });
  } else if (input.confidence === 3) {
    risks.push({
      item: "Demand and expected outcomes still need validation before full commitment.",
      severity: "medium",
    });
  }

  if (
    levelToScore(input.revenueImpact) <= 1 &&
    levelToScore(input.costSaving) <= 1 &&
    levelToScore(input.userImpact) <= 1
  ) {
    risks.push({
      item: `The feature may not materially move the ${input.strategicGoal.toLowerCase()} objective after launch.`,
      severity: "medium",
    });
  }

  if (!input.evidence) {
    risks.push({
      item: "The business case may be weaker because the decision is not yet backed by explicit evidence or data.",
      severity: "medium",
    });
  }

  if (risks.length === 0) {
    risks.push({
      item: "Execution quality and rollout discipline will determine whether expected value is realized.",
      severity: "low",
    });
  }

  return uniqueObjects(risks).slice(0, 5);
}

function buildQuestions(input: DecisionInput) {
  const questions = [
    `What is the clearest workflow problem that ${input.featureName} is solving?`,
    `What metric will prove this is helping the ${input.strategicGoal.toLowerCase()} objective?`,
    "What is the smallest release that can validate value quickly without overcommitting?",
  ];

  if (input.confidence <= 2) {
    questions.push("What concrete user, client, or operational evidence supports demand for this idea?");
  }

  if (input.effort >= 6 || input.dependencyComplexity === "High") {
    questions.push(
      "Which dependencies or delivery constraints could make the first release larger than planned?"
    );
  }

  if (input.regulatoryUrgency === "Critical" || input.regulatoryUrgency === "High") {
    questions.push("What minimum compliant outcome must be achieved first if time is constrained?");
  }

  if (!input.evidence) {
    questions.push("What baseline data should be collected before prioritizing this more aggressively?");
  }

  return unique(questions).slice(0, 5);
}

function buildMvpScope(input: DecisionInput, recommendation: Recommendation) {
  const includeItems = [
    `${input.featureName} core workflow`,
    "Basic success-state feedback for the user",
    "Minimal analytics to track adoption and business outcome",
  ];

  const excludeItems = [
    "Advanced customization",
    "Edge-case heavy workflows in the first release",
    "Complex admin controls and secondary flows",
  ];

  if (recommendation === "BUILD") {
    includeItems.push("A simple launch-ready version focused on one primary use case");
  }

  if (input.regulatoryUrgency === "Critical" || input.regulatoryUrgency === "High") {
    includeItems.push("Minimum compliance or operational coverage for the highest-priority scenario");
  }

  if (input.confidence <= 2 || input.effort >= 6 || input.dependencyComplexity === "High") {
    excludeItems.push("Deep integrations in the first release");
    excludeItems.push("Broad multi-persona support before validation");
  }

  if (input.riskLevel === "High") {
    excludeItems.push("Large-scale rollout before a narrower validation phase");
  }

  return {
    in: unique(includeItems).slice(0, 5),
    out: unique(excludeItems).slice(0, 6),
  };
}

function buildMetrics(input: DecisionInput, recommendation: Recommendation) {
  const baseMetrics = ["Adoption rate", "Time to first value", "Workflow completion rate"];

  if (input.strategicGoal === "Revenue") {
    baseMetrics.push("Revenue influenced or upsell conversion");
  } else if (input.strategicGoal === "Retention") {
    baseMetrics.push("Repeat usage or retention lift among exposed users");
  } else if (input.strategicGoal === "Compliance") {
    baseMetrics.push("Reduction in compliance exceptions or unresolved reporting issues");
  } else if (input.strategicGoal === "Efficiency") {
    baseMetrics.push("Operational time saved or manual effort reduced");
  } else if (input.strategicGoal === "Customer Experience") {
    baseMetrics.push("User satisfaction or reduction in workflow friction");
  }

  if (levelToScore(input.costSaving) >= 2) {
    baseMetrics.push("Reduction in processing cost or manual touchpoints");
  }

  if (recommendation !== "KILL") {
    baseMetrics.push("Pilot success rate");
  }

  return unique(baseMetrics).slice(0, 6);
}

function toTitleCase(input: string) {
  return input
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildUserStories(input: DecisionInput, recommendation: Recommendation): UserStory[] {
  const cleanName = toTitleCase(input.featureName);

  const stories: UserStory[] = [
    {
      title: `Access ${cleanName}`,
      story: `As a user, I want to access ${input.featureName} easily so that I can use its core value without confusion.`,
      priority: "P0",
    },
    {
      title: "Complete core workflow",
      story: `As a user, I want the main ${input.featureName} flow to be simple and reliable so that I can achieve the intended outcome quickly.`,
      priority: "P0",
    },
    {
      title: "See outcome or recommendation",
      story: `As a user, I want clear feedback after using ${input.featureName} so that I understand the result, confidence, and next step.`,
      priority: "P1",
    },
    {
      title: "Measure effectiveness",
      story: `As a product team member, I want tracking for ${input.featureName} so that I can evaluate adoption and business impact.`,
      priority: "P1",
    },
  ];

  if (recommendation === "BUILD") {
    stories.push({
      title: "Support launch readiness",
      story: `As a product owner, I want a tightly scoped first release for ${input.featureName} so that the team can launch quickly and learn from real usage.`,
      priority: "P2",
    });
  } else {
    stories.push({
      title: "Validate before expansion",
      story: `As a product team member, I want lightweight validation around ${input.featureName} so that we invest only after reducing uncertainty.`,
      priority: "P2",
    });
  }

  return stories.slice(0, 5);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const input = parseBody(body);

    if (!input.featureName || !input.description) {
      return NextResponse.json(
        { error: "Feature name and description are required" },
        { status: 400 }
      );
    }

    const valueScore = getValueScore(input);
    const feasibilityScore = getFeasibilityScore(input);
    const confidenceMultiplier = getConfidenceMultiplier(input.confidence);

    const rawScore = (valueScore * 4.4 + feasibilityScore * 2.6) * confidenceMultiplier;
    const score = Number(clamp(rawScore, 0, 100).toFixed(2));

    const baseRecommendation = getBaseRecommendation(score);
    const recommendation = getRecommendation(input, score, valueScore, feasibilityScore);

    const rationale = buildRationale(
      recommendation,
      score,
      valueScore,
      feasibilityScore,
      input
    );

    const assumptions = buildAssumptions(input);
    const risks = buildRisks(input);
    const questions = buildQuestions(input);
    const mvp_scope = buildMvpScope(input, recommendation);
    const metrics = buildMetrics(input, recommendation);
    const user_stories = buildUserStories(input, recommendation);

    return NextResponse.json({
      score,
      baseRecommendation,
      recommendation,
      rationale,
      assumptions,
      risks,
      questions,
      mvp_scope,
      metrics,
      user_stories,
    });
  } catch (err: any) {
    console.error("API ERROR:", err?.message || err);
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Recommendation = "BUILD" | "DELAY" | "KILL";
type Severity = "low" | "medium" | "high";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function unique<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function getImpactScore(impact: string) {
  const impactMap: Record<string, number> = { Low: 2, Medium: 5, High: 8 };
  return impactMap[impact] ?? 5;
}

function getBaseRecommendation(score: number): Recommendation {
  if (score >= 6) return "BUILD";
  if (score >= 3) return "DELAY";
  return "KILL";
}

function getRecommendation(
  score: number,
  impact: string,
  effort: number,
  confidence: number
): Recommendation {
  if (impact === "High" && effort <= 4 && confidence >= 4) return "BUILD";
  if (impact === "Low" && effort >= 7) return "KILL";
  if (confidence <= 2 && effort >= 6) return "DELAY";
  if (score >= 6) return "BUILD";
  if (score >= 3) return "DELAY";
  return "KILL";
}

function buildRationale(
  recommendation: Recommendation,
  score: number,
  impact: string,
  effort: number,
  confidence: number,
  goal: string
) {
  const parts: string[] = [];

  if (impact === "High") {
    parts.push("The feature appears to have strong potential business impact.");
  } else if (impact === "Medium") {
    parts.push("The feature shows moderate business potential.");
  } else {
    parts.push("The feature currently appears to have limited business impact.");
  }

  if (effort <= 3) {
    parts.push("Implementation effort is relatively low, which supports faster execution.");
  } else if (effort <= 6) {
    parts.push("Implementation effort looks manageable but still requires prioritization discipline.");
  } else {
    parts.push("Implementation effort is high, which increases delivery risk and delays time to value.");
  }

  if (confidence >= 4) {
    parts.push("Confidence is strong enough to support a near-term decision.");
  } else if (confidence === 3) {
    parts.push("Confidence is moderate, so some validation is still needed.");
  } else {
    parts.push("Confidence is low, which suggests the team should validate key assumptions first.");
  }

  const ending =
    recommendation === "BUILD"
      ? `Overall, this supports a BUILD recommendation in service of the ${goal.toLowerCase()} goal.`
      : recommendation === "DELAY"
      ? `Overall, this is better treated as a DELAY decision until uncertainty is reduced.`
      : `Overall, this does not justify near-term investment and is better deprioritized for now.`;

  return `${parts.join(" ")} ${ending} Current score: ${score}.`;
}

function buildAssumptions(
  featureName: string,
  goal: string,
  impact: string,
  confidence: number
) {
  const assumptions = [
    `The problem addressed by ${featureName} is important enough to influence the ${goal.toLowerCase()} goal.`,
    "Users will understand the value proposition without heavy education or onboarding.",
    "The first release can be scoped tightly enough to ship without unnecessary complexity.",
  ];

  if (impact === "High") {
    assumptions.push("If launched well, this feature should create visible business or user value.");
  }

  if (confidence <= 2) {
    assumptions.push("The team does not yet have enough evidence to validate demand with high certainty.");
  } else {
    assumptions.push("Existing signals are directionally strong enough to justify a structured first release.");
  }

  return unique(assumptions).slice(0, 4);
}

function buildRisks(
  impact: string,
  effort: number,
  confidence: number,
  goal: string
) {
  const risks: { item: string; severity: Severity }[] = [];

  if (effort >= 7) {
    risks.push({
      item: "Implementation scope may expand beyond the first release and delay delivery.",
      severity: "high",
    });
  } else if (effort >= 5) {
    risks.push({
      item: "Delivery may take longer than expected if dependencies are not controlled early.",
      severity: "medium",
    });
  }

  if (confidence <= 2) {
    risks.push({
      item: "The team may be solving an under-validated problem with insufficient user evidence.",
      severity: "high",
    });
  } else if (confidence === 3) {
    risks.push({
      item: "User demand and expected outcomes still need validation before full commitment.",
      severity: "medium",
    });
  }

  if (impact === "Low") {
    risks.push({
      item: `The feature may not materially move the ${goal.toLowerCase()} goal after launch.`,
      severity: "medium",
    });
  }

  if (risks.length === 0) {
    risks.push({
      item: "Execution quality and rollout discipline will determine whether expected value is realized.",
      severity: "low",
    });
  }

  return unique(risks.map((r) => JSON.stringify(r))).map((x) => JSON.parse(x)).slice(0, 4);
}

function buildQuestions(
  featureName: string,
  goal: string,
  effort: number,
  confidence: number
) {
  const questions = [
    `What is the clearest user problem that ${featureName} is solving?`,
    `What metric will prove this feature is helping the ${goal.toLowerCase()} goal?`,
    "What is the smallest version that can be shipped to validate value quickly?",
  ];

  if (confidence <= 2) {
    questions.push("What concrete user evidence supports demand for this feature?");
  }

  if (effort >= 6) {
    questions.push("Which dependencies or technical constraints could make the first release larger than planned?");
  }

  return unique(questions).slice(0, 4);
}

function buildMvpScope(
  featureName: string,
  recommendation: Recommendation,
  effort: number,
  confidence: number
) {
  const includeItems = [
    `${featureName} core workflow`,
    "Basic success-state feedback for the user",
    "Minimal analytics to track adoption and outcome",
  ];

  const excludeItems = [
    "Advanced customization",
    "Edge-case heavy workflows",
    "Complex admin controls",
  ];

  if (recommendation === "BUILD") {
    includeItems.push("A simple launch-ready version with one primary use case");
  }

  if (confidence <= 2 || effort >= 6) {
    excludeItems.push("Deep integrations in the first release");
    excludeItems.push("Broad multi-persona support before validation");
  }

  return {
    in: unique(includeItems).slice(0, 4),
    out: unique(excludeItems).slice(0, 5),
  };
}

function buildMetrics(goal: string, recommendation: Recommendation) {
  const baseMetrics = ["Activation rate", "Adoption rate", "7-day feature usage"];

  if (goal === "Revenue") {
    baseMetrics.push("Conversion to paid or upsell-influenced usage");
  } else if (goal === "Growth") {
    baseMetrics.push("New user activation influenced by the feature");
  } else if (goal === "Retention") {
    baseMetrics.push("Repeat usage or retention lift among exposed users");
  } else if (goal === "Enterprise") {
    baseMetrics.push("Account adoption across target teams");
  } else if (goal === "Tech debt") {
    baseMetrics.push("Operational time saved or issue reduction");
  }

  if (recommendation !== "KILL") {
    baseMetrics.push("Time to first value");
  }

  return unique(baseMetrics).slice(0, 5);
}

function toTitleCase(input: string) {
  return input
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildUserStories(featureName: string, recommendation: Recommendation) {
  const cleanName = toTitleCase(featureName);

  const stories = [
    {
      title: `Access ${cleanName}`,
      story: `As a user, I want to access ${featureName} easily so that I can use its core value without confusion.`,
      priority: "P0" as const,
    },
    {
      title: `Complete core workflow`,
      story: `As a user, I want the main ${featureName} flow to be simple and reliable so that I can achieve the intended outcome quickly.`,
      priority: "P0" as const,
    },
    {
      title: `See outcome or feedback`,
      story: `As a user, I want clear feedback after using ${featureName} so that I understand the result and next step.`,
      priority: "P1" as const,
    },
    {
      title: `Measure effectiveness`,
      story: `As a product team member, I want basic tracking for ${featureName} so that I can evaluate adoption and success.`,
      priority: "P1" as const,
    },
  ];

  if (recommendation === "BUILD") {
    stories.push({
      title: `Support launch readiness`,
      story: `As a product owner, I want a tightly scoped first release so that the team can launch quickly and learn from real usage.`,
      priority: "P2" as const,
    });
  } else {
    stories.push({
      title: `Validate before expansion`,
      story: `As a product team member, I want lightweight validation around ${featureName} so that we invest only after reducing uncertainty.`,
      priority: "P2" as const,
    });
  }

  return stories.slice(0, 5);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const featureName = (body.featureName ?? "").toString().trim();
    const description = (body.description ?? "").toString().trim();
    const goal = (body.goal ?? "Growth").toString().trim();
    const impact = (body.impact ?? "Medium").toString().trim();
    const effort = clamp(Number(body.effort ?? 5), 1, 10);
    const confidence = clamp(Number(body.confidence ?? 3), 1, 5);

    if (!featureName || !description) {
      return NextResponse.json(
        { error: "Feature name and description are required" },
        { status: 400 }
      );
    }

    const impactScore = getImpactScore(impact);
    const confidenceScore = confidence * 2;
    const score = Number(((impactScore * confidenceScore) / effort).toFixed(2));

    const baseRecommendation = getBaseRecommendation(score);
    const recommendation = getRecommendation(score, impact, effort, confidence);

    const rationale = buildRationale(
      recommendation,
      score,
      impact,
      effort,
      confidence,
      goal
    );

    const assumptions = buildAssumptions(featureName, goal, impact, confidence);
    const risks = buildRisks(impact, effort, confidence, goal);
    const questions = buildQuestions(featureName, goal, effort, confidence);
    const mvp_scope = buildMvpScope(featureName, recommendation, effort, confidence);
    const metrics = buildMetrics(goal, recommendation);
    const user_stories = buildUserStories(featureName, recommendation);

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
// Fetch package information from the Score API for both pip and conda

export type CategorizedScore = {
  value: string;
  notes: string[];
};

export type Score = {
  legal: CategorizedScore;
  health_risk: CategorizedScore;
  maturity: CategorizedScore;
  security: CategorizedScore;
  notes: string[];
};

export function* getCategorizedScores(
  score: Score,
): Generator<[string, CategorizedScore]> {
  // These are the categories we know are CategorizedScore
  const categorizedScoreKeys = [
    "maturity",
    "health_risk",
    "security",
    "legal",
  ] as const;

  for (const category of categorizedScoreKeys) {
    const categoryScore = score[category];

    // Check if it's a CategorizedScore object
    if (
      categoryScore &&
      typeof categoryScore === "object" &&
      "value" in categoryScore
    ) {
      yield [category, categoryScore as CategorizedScore];
    }
  }
}

type OKResponse = {
  status: "ok";
  score: Score;
};

type ScoreResponse = OKResponse;

export const ScoreValues = {
  HEALTHY: "Healthy",
  MATURE: "Mature",
  CAUTION_NEEDED: "Caution Needed",
  MODERATE_RISK: "Moderate Risk",
  HIGH_RISK: "High Risk",
  EXPERIMENTAL: "Experimental",
  STALE: "Stale",
  LEGACY: "Legacy",
  UNKNOWN: "Unknown",
  PLACEHOLDER: "Placeholder",
};

export default async function fetchPackageScore(
  ecosystem: string,
  packageName: string,
) {
  const url = `https:/opensourcescore.dev/score/${ecosystem}/${packageName}`;

  const response = await fetch(url);
  const data = await response.json();
  if (response.status >= 500) {
    console.error(data);
    throw new Error(`Server error fetching package score: ${response.status}`);
  }

  return data as ScoreResponse;
}

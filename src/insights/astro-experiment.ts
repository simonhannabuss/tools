/**
 * "Does astrology add anything for you?"
 *
 * For each published post we know:
 *   actual   = its 48h views ÷ your platform baseline
 *   expected = what the practical model predicted for its slot (best-times.ts)
 * The residual log(actual / expected) is what timing/practical factors did NOT explain.
 * If astro-favourable posts have consistently higher residuals than the rest, astrology is adding something.
 */
export type ExperimentRow = { actual: number; expected: number; favourable: boolean | undefined };

export type ExperimentResult = {
  favourable: { n: number; vsExpectedPct: number | null };
  others: { n: number; vsExpectedPct: number | null };
  verdict: "Not enough evidence yet" | "No measurable difference" | "Favourable windows do better" | "Favourable windows do worse";
};

export const MIN_PER_GROUP = 30;

function stats(xs: number[]) {
  const n = xs.length;
  if (!n) return { n, mean: 0, variance: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return { n, mean, variance };
}

const pct = (logMean: number, n: number) => (n ? Math.round((Math.exp(logMean) - 1) * 100) : null);

export function runAstroExperiment(rows: ExperimentRow[]): ExperimentResult {
  const residual = (r: ExperimentRow) => Math.log(r.actual / r.expected);
  const ok = rows.filter((r) => r.actual > 0 && r.expected > 0);
  const fav = stats(ok.filter((r) => r.favourable === true).map(residual));
  const rest = stats(ok.filter((r) => r.favourable !== true).map(residual));

  const result: ExperimentResult = {
    favourable: { n: fav.n, vsExpectedPct: pct(fav.mean, fav.n) },
    others: { n: rest.n, vsExpectedPct: pct(rest.mean, rest.n) },
    verdict: "Not enough evidence yet",
  };
  if (fav.n < MIN_PER_GROUP || rest.n < MIN_PER_GROUP) return result;

  // Welch's t-test; |t| > 2 ≈ 95% confidence.
  const se = Math.sqrt(fav.variance / fav.n + rest.variance / rest.n);
  const t = se > 0 ? (fav.mean - rest.mean) / se : 0;
  result.verdict = t > 2 ? "Favourable windows do better" : t < -2 ? "Favourable windows do worse" : "No measurable difference";
  return result;
}

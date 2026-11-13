/**
 * Practical lane: "when should I post?"
 *
 * Each slot (e.g. "tue-18-21") starts with a benchmark prior. Every post you publish adds an observation:
 *   ratio = views at 48h ÷ your typical 48h views on that platform.
 * We average in log space (so 2× and 0.5× cancel out) and shrink toward the prior:
 *   estimate = (K·log(prior) + n·mean(log(ratio))) / (K + n)
 * With few posts the benchmark dominates; with many, your own data does.
 */
import { allSlots } from "./time";

export const PRIOR_WEIGHT = 5; // "the benchmark counts as 5 posts"
export const EXPLORE_RATE = 0.2; // 1 in 5 suggestions tries an uncertain slot

export type Confidence = "Low" | "Medium" | "High";

export type SlotEstimate = {
  slot: string;
  multiplier: number; // 1.0 = your average, 1.4 = 40% better
  n: number;
  confidence: Confidence;
  source: "benchmark" | "blended" | "mine";
};

/**
 * Starter benchmark multipliers by hour band. General social media wisdom, not gospel — edit freely.
 * Weekday evenings and lunchtimes tend to do well; overnight poorly.
 */
export function benchmarkPrior(slot: string, platform: string): number {
  const [day, start] = slot.split("-");
  const h = Number(start);
  const weekend = day === "sat" || day === "sun";
  let m = h < 6 ? 0.6 : h < 9 ? 0.85 : h < 12 ? 1.0 : h < 15 ? 1.1 : h < 18 ? 1.0 : h < 21 ? 1.2 : 1.0;
  if (platform === "linkedin") {
    // Professional network: mornings on weekdays, weekends quiet.
    m = h >= 6 && h < 12 ? 1.25 : h < 15 && h >= 12 ? 1.05 : 0.8;
    if (weekend) m *= 0.6;
  } else if (weekend && h >= 9 && h < 15) {
    m *= 1.1;
  }
  return m;
}

export function confidenceFor(n: number): Confidence {
  return n < 3 ? "Low" : n < 10 ? "Medium" : "High";
}

export function estimateSlot(prior: number, ratios: number[], k = PRIOR_WEIGHT): SlotEstimate & { slot: "" } {
  const valid = ratios.filter((r) => r > 0 && Number.isFinite(r));
  const n = valid.length;
  const meanLog = n ? valid.reduce((s, r) => s + Math.log(r), 0) / n : 0;
  const est = Math.exp((k * Math.log(prior) + n * meanLog) / (k + n));
  return {
    slot: "",
    multiplier: Number(est.toFixed(3)),
    n,
    confidence: confidenceFor(n),
    source: n === 0 ? "benchmark" : n >= 3 * k ? "mine" : "blended",
  };
}

/** ratiosBySlot: for one platform, the 48h performance ratios of past posts grouped by slot. */
export function estimateAllSlots(platform: string, ratiosBySlot: Record<string, number[]>): SlotEstimate[] {
  return allSlots().map((slot) => ({ ...estimateSlot(benchmarkPrior(slot, platform), ratiosBySlot[slot] ?? []), slot }));
}

/** Pick a slot to recommend. Usually the best; sometimes (EXPLORE_RATE) a promising slot we know little about. */
export function recommend(estimates: SlotEstimate[], rand = Math.random): SlotEstimate & { testing: boolean } {
  const sorted = [...estimates].sort((a, b) => b.multiplier - a.multiplier);
  if (rand() < EXPLORE_RATE) {
    const candidates = sorted.slice(0, Math.ceil(sorted.length / 2)).filter((s) => s.n < 3);
    if (candidates.length) return { ...candidates[Math.floor(rand() * candidates.length)], testing: true };
  }
  return { ...sorted[0], testing: false };
}

/** Your "typical" 48h views on a platform: median of recent posts (robust to one viral hit). */
export function baseline(recentViews: number[]): number | null {
  const v = recentViews.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

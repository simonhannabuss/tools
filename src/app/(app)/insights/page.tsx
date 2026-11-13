import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { adapter } from "@/platforms";
import { baseline, benchmarkPrior, estimateAllSlots, recommend } from "@/insights/best-times";
import { runAstroExperiment, type ExperimentRow } from "@/insights/astro-experiment";

/**
 * First version of Insights: per-platform best slots (practical lane) and the astrology experiment.
 * The heatmap / charts from the Figma designs come next.
 */
export default async function InsightsPage() {
  const rows = await db
    .select({ target: schema.postTargets, views: schema.metricSnapshots.views })
    .from(schema.postTargets)
    .innerJoin(schema.metricSnapshots, eq(schema.metricSnapshots.targetId, schema.postTargets.id))
    .where(and(eq(schema.metricSnapshots.checkpoint, "48h"), isNotNull(schema.postTargets.practicalFactors)));

  const byPlatform = new Map<string, typeof rows>();
  for (const r of rows) byPlatform.set(r.target.platform, [...(byPlatform.get(r.target.platform) ?? []), r]);

  const experiment: ExperimentRow[] = [];
  const sections = [...byPlatform.entries()].map(([platform, list]) => {
    const base = baseline(list.map((r) => r.views ?? 0)) ?? 1;
    const ratiosBySlot: Record<string, number[]> = {};
    for (const r of list) {
      const slot = r.target.practicalFactors!.slot;
      const ratio = (r.views ?? 0) / base;
      (ratiosBySlot[slot] ??= []).push(ratio);
    }
    const estimates = estimateAllSlots(platform, ratiosBySlot);
    for (const r of list) {
      const est = estimates.find((e) => e.slot === r.target.practicalFactors!.slot);
      experiment.push({ actual: (r.views ?? 0) / base, expected: est?.multiplier ?? benchmarkPrior(r.target.practicalFactors!.slot, platform), favourable: r.target.astroFactors?.favourable });
    }
    const top = [...estimates].sort((a, b) => b.multiplier - a.multiplier).slice(0, 3);
    return { platform, n: list.length, top, pick: recommend(estimates) };
  });
  const exp = runAstroExperiment(experiment);

  return (
    <>
      <h1>Insights</h1>
      <p className="sub">Practical data and astrology are kept separate. Stats arrive 1h, 24h, 48h and 7 days after each post.</p>

      <div className="card">
        <h2><span className="pill api">DATA</span> Practical best times</h2>
        {!sections.length && <p className="muted">No 48-hour stats yet. Until then, suggestions use general benchmarks.</p>}
        {sections.map((s) => (
          <div key={s.platform} style={{ marginBottom: 12 }}>
            <strong>{adapter(s.platform as never).name}</strong> <span className="muted">· {s.n} posts</span>
            {s.top.map((t) => (
              <div className="row" key={t.slot} style={{ padding: "2px 0" }}>
                <span style={{ width: 120 }}>{t.slot}</span>
                <span className="grow">{t.multiplier.toFixed(2)}× your average</span>
                <span className="pill">{t.confidence}</span>
                <span className="muted">{t.source}</span>
              </div>
            ))}
            <p className="muted">Next suggestion: {s.pick.slot}{s.pick.testing ? " (testing an uncertain slot)" : ""}</p>
          </div>
        ))}
      </div>

      <div className="card">
        <h2><span className="pill astro">ASTROLOGY</span> Does astrology add anything for you?</h2>
        <p className="muted">
          Each post is first scored against what the practical model expected. Then posts in astro-favourable windows are compared with the rest.
        </p>
        <div className="row">
          <span className="grow">Astro-favourable posts: {exp.favourable.n} · {exp.favourable.vsExpectedPct ?? "—"}% vs expected</span>
          <span className="grow">Other posts: {exp.others.n} · {exp.others.vsExpectedPct ?? "—"}% vs expected</span>
          <span className="pill">{exp.verdict}</span>
        </div>
      </div>
    </>
  );
}

/**
 * Astrology lane. Calculated, never "learned" — the worker stores these factors next to each post
 * (in post_targets.astro_factors, separate from practical_factors) so their effect can be tested
 * against what the practical model expected. See insights/astro-experiment.ts.
 */
import type { AstroFactors } from "@/db/schema";
import { planetaryHourAt, type Planet } from "./planetary-hours";

/** Traditional benefics / malefics. Edit to taste. */
const FAVOURABLE: Planet[] = ["Venus", "Jupiter"];
const CAUTION: Planet[] = ["Saturn", "Mars"];

export type AstroSettings = {
  planetaryHours?: boolean;
  moonSignPhase?: boolean;
  transits?: boolean;
  moonVoidOfCourse?: boolean;
  mercuryRetrograde?: boolean;
};

export function computeAstroFactors(
  when: Date,
  place: { lat: number; lng: number; timeZone: string },
  settings: AstroSettings = { planetaryHours: true },
): AstroFactors {
  const f: AstroFactors = {};
  if (settings.planetaryHours !== false) {
    const h = planetaryHourAt(when, place.lat, place.lng, place.timeZone);
    if (h) {
      f.planetaryHour = h.planet;
      f.dayRuler = h.dayRuler;
      f.favourable = FAVOURABLE.includes(h.planet) ? true : CAUTION.includes(h.planet) ? false : undefined;
    }
  }
  // TODO (needs an ephemeris, e.g. the `astronomy-engine` package):
  //  - moonSign / moonPhase
  //  - moonVoidOfCourse
  //  - mercuryRetrograde
  //  - transits to natal Sun / Moon / Rising from the astro_profile birth data
  return f;
}

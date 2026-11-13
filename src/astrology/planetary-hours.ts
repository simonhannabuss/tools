/**
 * Traditional planetary hours. The day (sunrise → sunset) and night (sunset → next sunrise)
 * are each split into 12 equal "hours", ruled in Chaldean order, starting with the day's ruler.
 */
import { sunTimes } from "./sun";
import { localParts } from "@/insights/time";

export const CHALDEAN = ["Saturn", "Jupiter", "Mars", "Sun", "Venus", "Mercury", "Moon"] as const;
export type Planet = (typeof CHALDEAN)[number];
/** Ruler of each weekday, 0 = Sunday. */
export const DAY_RULERS: Planet[] = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];

export type PlanetaryHour = {
  planet: Planet;
  dayRuler: Planet;
  index: number; // 0–11 day hours, 12–23 night hours
  isDay: boolean;
  start: Date;
  end: Date;
};

const H = 3_600_000;

export function planetaryHourAt(t: Date, lat: number, lng: number, timeZone: string): PlanetaryHour | null {
  const today = sunTimes(t, lat, lng);
  if (!today) return null; // polar day/night — not defined

  let start: Date, end: Date, dayStartSunrise: Date, offset: number, isDay: boolean;
  if (t < today.sunrise) {
    const prev = sunTimes(new Date(t.getTime() - 24 * H), lat, lng);
    if (!prev) return null;
    [start, end, dayStartSunrise, offset, isDay] = [prev.sunset, today.sunrise, prev.sunrise, 12, false];
  } else if (t >= today.sunset) {
    const next = sunTimes(new Date(t.getTime() + 24 * H), lat, lng);
    if (!next) return null;
    [start, end, dayStartSunrise, offset, isDay] = [today.sunset, next.sunrise, today.sunrise, 12, false];
  } else {
    [start, end, dayStartSunrise, offset, isDay] = [today.sunrise, today.sunset, today.sunrise, 0, true];
  }

  const len = (end.getTime() - start.getTime()) / 12;
  const i = Math.min(11, Math.floor((t.getTime() - start.getTime()) / len));
  const dayRuler = DAY_RULERS[localParts(dayStartSunrise, timeZone).weekday];
  const index = offset + i;
  const planet = CHALDEAN[(CHALDEAN.indexOf(dayRuler) + index) % 7];
  return {
    planet,
    dayRuler,
    index,
    isDay,
    start: new Date(start.getTime() + i * len),
    end: new Date(start.getTime() + (i + 1) * len),
  };
}

/** Every planetary hour between two dates (for the Timing screen's astrology track). */
export function planetaryHoursBetween(from: Date, to: Date, lat: number, lng: number, timeZone: string): PlanetaryHour[] {
  const out: PlanetaryHour[] = [];
  let t = new Date(from);
  while (t < to) {
    const h = planetaryHourAt(t, lat, lng, timeZone);
    if (!h) break;
    out.push(h);
    t = new Date(h.end.getTime() + 1000);
  }
  return out;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { sunTimes } from "./sun";
import { planetaryHourAt } from "./planetary-hours";

const MADRID = { lat: 40.4168, lng: -3.7038, tz: "Europe/Madrid" };
const near = (a: Date, iso: string, minutes = 6) =>
  assert.ok(Math.abs(a.getTime() - new Date(iso).getTime()) < minutes * 60_000, `${a.toISOString()} not near ${iso}`);

test("Madrid sunrise/sunset on the summer solstice", () => {
  const t = sunTimes(new Date("2026-06-21T12:00:00Z"), MADRID.lat, MADRID.lng)!;
  near(t.sunrise, "2026-06-21T04:45:00Z"); // 06:45 local
  near(t.sunset, "2026-06-21T19:48:00Z"); // 21:48 local
});

test("first hour after sunrise is ruled by the day's planet", () => {
  // Sunday 21 June 2026, shortly after sunrise → Sun
  const h = planetaryHourAt(new Date("2026-06-21T05:00:00Z"), MADRID.lat, MADRID.lng, MADRID.tz)!;
  assert.equal(h.dayRuler, "Sun");
  assert.equal(h.planet, "Sun");
  assert.equal(h.index, 0);
});

test("before sunrise belongs to the previous planetary day's night", () => {
  // Monday 22 June 2026 at 03:00 local is still Sunday's night
  const h = planetaryHourAt(new Date("2026-06-22T01:00:00Z"), MADRID.lat, MADRID.lng, MADRID.tz)!;
  assert.equal(h.dayRuler, "Sun");
  assert.equal(h.isDay, false);
});

test("Monday's first hour is the Moon (Chaldean sequence wraps correctly)", () => {
  const h = planetaryHourAt(new Date("2026-06-22T05:00:00Z"), MADRID.lat, MADRID.lng, MADRID.tz)!;
  assert.equal(h.planet, "Moon");
});

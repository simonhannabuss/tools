const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Weekday (0 = Sunday) and hour of `date` as seen in `timeZone`. */
export function localParts(date: Date, timeZone: string): { weekday: number; hour: number; ymd: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = WEEKDAYS.indexOf(get("weekday").toLowerCase().slice(0, 3) as (typeof WEEKDAYS)[number]);
  return { weekday, hour: Number(get("hour")), ymd: `${get("year")}-${get("month")}-${get("day")}` };
}

/** 3-hour buckets matching the Insights heatmap: 06–09, 09–12, ... 21–24, plus 00–06 overnight. */
export function slotOf(weekday: number, hour: number): string {
  const start = hour < 6 ? 0 : Math.floor(hour / 3) * 3;
  const end = hour < 6 ? 6 : start + 3;
  return `${WEEKDAYS[weekday]}-${String(start).padStart(2, "0")}-${String(end).padStart(2, "0")}`;
}

export function allSlots(): string[] {
  const out: string[] = [];
  for (let d = 0; d < 7; d++) {
    out.push(slotOf(d, 0));
    for (let h = 6; h < 24; h += 3) out.push(slotOf(d, h));
  }
  return out;
}

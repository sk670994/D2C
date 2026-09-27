import type { Move } from "./insights";

/** ISO week label, e.g. 2026-W40 (alerts repeat at most once per rival per week). */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function alertKey(move: Pick<Move, "kind" | "pageId">, week: string): string {
  return `${move.kind}:${move.pageId}:${week}`;
}

/** Big moves this user has not been alerted about this week. */
export function alertsToSend(moves: Move[], alreadySent: Set<string>, week: string): Move[] {
  return moves.filter((m) => m.kind === "big" && !alreadySent.has(alertKey(m, week)));
}

export function alertSubject(moves: Move[]): string {
  if (moves.length === 1) return `${moves[0].brand} just made a big move`;
  return `${moves.length} rivals made big moves: ${moves.map((m) => m.brand).slice(0, 3).join(", ")}`;
}

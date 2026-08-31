export function rupees(n: number | null | undefined, digits = 0): string {
  const value = Number(n ?? 0);
  return `₹${value.toLocaleString("en-IN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits > 0 && Math.abs(value) < 10 ? digits : 0
  })}`;
}

export function pct(n: number | null | undefined, digits = 1): string {
  return `${(Number(n ?? 0) * 100).toFixed(digits)}%`;
}

export function times(n: number | null | undefined, digits = 2): string {
  return `${Number(n ?? 0).toFixed(digits)}x`;
}

export function todayLabel(date = new Date()): string {
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export function greetingFor(name: string, date = new Date()): string {
  const hour = date.getHours();
  const first = name.trim().split(/\s+/)[0];
  const who = first ? first.toUpperCase() : "FOUNDER";
  const when = hour < 12 ? "GOOD MORNING" : hour < 17 ? "GOOD AFTERNOON" : "GOOD EVENING";
  return `${when}, ${who}`;
}

export function askZwirk(prompt: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("zooptrack:ask-zwirk", { detail: prompt }));
}

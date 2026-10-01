export const EXISTING_BRANDS = [
  "Nike",
  "Adidas",
  "boAt",
  "Mamaearth",
  "Minimalist",
  "Noise",
  "Nykaa",
  "Myntra",
  "Sugar Cosmetics",
];

export const UNKNOWN_BRANDS = [
  "Test Brand Alpha",
  "Test Brand Beta",
  "Random Commerce One",
  "Example D2C",
  "Load Test Brand",
];

export const KEYWORDS = [
  "sunscreen",
  "protein",
  "shoes",
  "skincare",
  "sale",
  "fashion",
];

export function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function randomDelay(
  minMs = 500,
  maxMs = 3500
): number {
  return Math.floor(
    Math.random() * (maxMs - minMs + 1)
  ) + minMs;
}

import {
  describe,
  expect,
  it,
} from "vitest";

function normalize(
  value: string,
): string {
  return value
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function score(
  name: string,
  query: string,
): number {
  const n =
    name
      .trim()
      .toLowerCase();

  const q =
    query
      .trim()
      .toLowerCase();

  let result = 0;

  if (n === q) {
    result += 10_000;
  }

  if (n.startsWith(q)) {
    result += 8_000;
  }

  if (
    n
      .split(
        /[\s'’._-]+/,
      )
      .some(
        (word) =>
          word.startsWith(q),
      )
  ) {
    result += 6_500;
  }

  if (n.includes(q)) {
    result += 4_500;
  }

  return result;
}

describe(
  "advertiser discovery ranking",
  () => {
    it(
      "ranks exact advertiser above partial matches",
      () => {
        const results = [
          "Snitch Clothing",
          "Snitch",
          "My Snit Store",
        ]
          .map((name) => ({
            name,
            score: score(
              name,
              "snitch",
            ),
          }))
          .sort(
            (a, b) =>
              b.score - a.score,
          );

        expect(
          results[0].name,
        ).toBe("Snitch");
      },
    );

    it(
      "normalizes punctuation",
      () => {
        expect(
          normalize(
            "Snitch's Store",
          ),
        ).toBe(
          "snitch s store",
        );
      },
    );

    it(
      "keeps exact phrase independent",
      () => {
        expect(
          normalize("Nike"),
        ).toBe("nike");
      },
    );
  },
);
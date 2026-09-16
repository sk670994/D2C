import type { ZwirkIntent } from "../context/types";

const patterns: Array<[ZwirkIntent, RegExp[]]> = [
  [
    "ad_success_analysis",
    [
      /\bwhy\b.*\b(ad|creative)\b.*\b(work|success|successful|perform)\b/i,
      /\bwhy\b.*\bthis ad\b/i
    ]
  ],
  [
    "ad_failure_analysis",
    [
      /\bwhy\b.*\b(ad|creative)\b.*\b(fail|failure|weak|bad)\b/i,
      /\bwhy\b.*\bthis ad\b.*\bnot\b/i
    ]
  ],
  [
    "creative_analysis",
    [
      /\bcreative\b/i,
      /\bhook\b/i,
      /\bcta\b/i,
      /\bcopy\b/i
    ]
  ],
  [
    "competitor_comparison",
    [
      /\bcompare\b.*\bcompetitor/i,
      /\bcompare\b.*\bads?\b/i,
      /\bwhich\b.*\bcompetitor\b.*\b(ad|creative)/i
    ]
  ],
  [
    "competitor_analysis",
    [
      /\bcompetitor/i,
      /\bmarket\b.*\bdoing\b/i,
      /\bwhat are .* brands\b/i
    ]
  ],
  [
    "scaling",
    [
      /\bscale\b/i,
      /\bscaling\b/i,
      /\bincrease budget\b/i
    ]
  ],
  [
    "experiment",
    [
      /\btest\b/i,
      /\bexperiment\b/i,
      /\bcreative to try\b/i
    ]
  ],
  [
    "economics",
    [
      /\bcac\b/i,
      /\broas\b/i,
      /\bprofit\b/i,
      /\bmargin\b/i,
      /\bcontribution\b/i,
      /\bunit economics\b/i
    ]
  ],
  [
    "diagnosis",
    [
      /\bwhy\b/i,
      /\bproblem\b/i,
      /\bleak\b/i,
      /\bleakage\b/i,
      /\bissue\b/i,
      /\bdiagnos/i
    ]
  ]
];

export function routeZwirkIntent(question: string): ZwirkIntent {
  const value = question.trim();

  for (const [intent, regexes] of patterns) {
    if (regexes.some((regex) => regex.test(value))) {
      return intent;
    }
  }

  return "general";
}

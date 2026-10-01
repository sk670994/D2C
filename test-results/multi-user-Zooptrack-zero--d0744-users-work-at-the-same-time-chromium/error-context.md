# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: multi-user.spec.ts >> Zooptrack zero-credit multi-user simulation >> 5 independent users work at the same time
- Location: tests\load\multi-user.spec.ts:20:9

# Error details

```
Test timeout of 90000ms exceeded.
```

```
Error: Some users failed. See tests/results/multi-user-report.json

expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: 5
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e4]:
        - link "Zooptrack home" [ref=e5] [cursor=pointer]:
          - /url: /
          - img "Zooptrack" [ref=e7]
        - heading "Know what your rivals ran this week." [level=1] [ref=e8]
        - paragraph [ref=e9]: Start a 7-day free trial. No card, no ad-account access needed.
        - list [ref=e10]:
          - listitem [ref=e11]: Pick up to 5 rivals; their first ads load right away.
          - listitem [ref=e12]: Today shows what changed, with the ads as evidence.
          - listitem [ref=e13]: A Monday email sums up the week in two minutes.
      - generic [ref=e14]:
        - generic [ref=e15]:
          - generic [ref=e16]:
            - heading "Sign In or Create Account" [level=3] [ref=e17]
            - paragraph [ref=e18]: Email/password sign-in for owners and agencies.
          - button "Dark Mode" [ref=e19] [cursor=pointer]
        - generic [ref=e20]:
          - generic [ref=e22]:
            - generic [ref=e23]:
              - button "Sign In" [ref=e24] [cursor=pointer]
              - button "Sign Up" [ref=e25] [cursor=pointer]
            - generic [ref=e26]:
              - generic [ref=e27]: Email
              - textbox "Email" [ref=e28]:
                - /placeholder: you@brand.com
            - generic [ref=e29]:
              - generic [ref=e30]: Password
              - textbox "Password" [ref=e31]:
                - /placeholder: Minimum 6 characters
            - button "Sign In" [ref=e32] [cursor=pointer]
          - generic [ref=e33]: or continue with Google
          - button "Sign in with Google" [ref=e37] [cursor=pointer]
          - paragraph [ref=e44]:
            - text: By continuing, you agree to our
            - link "Terms" [ref=e45] [cursor=pointer]:
              - /url: /terms
            - text: and
            - link "Privacy Policy" [ref=e46] [cursor=pointer]:
              - /url: /privacy
            - text: .
  - contentinfo [ref=e47]:
    - generic [ref=e48]:
      - generic [ref=e49]:
        - img "Zooptrack" [ref=e51]
        - heading "Competitor ad intelligence for Indian D2C." [level=3] [ref=e52]
        - paragraph [ref=e53]: See what your rivals run. Know what changed. Know your next move.
      - generic [ref=e54]:
        - generic [ref=e55]:
          - paragraph [ref=e56]: Product
          - list [ref=e57]:
            - listitem [ref=e58]:
              - link "Today" [ref=e59] [cursor=pointer]:
                - /url: /today
            - listitem [ref=e60]:
              - link "Discover ads" [ref=e61] [cursor=pointer]:
                - /url: /adspy
            - listitem [ref=e62]:
              - link "Pricing" [ref=e63] [cursor=pointer]:
                - /url: /pricing
            - listitem [ref=e64]:
              - link "Start free trial" [ref=e65] [cursor=pointer]:
                - /url: /login
        - generic [ref=e66]:
          - paragraph [ref=e67]: Company
          - list [ref=e68]:
            - listitem [ref=e69]:
              - link "Contact" [ref=e70] [cursor=pointer]:
                - /url: /contact
            - listitem [ref=e71]:
              - link "FAQ" [ref=e72] [cursor=pointer]:
                - /url: /faq
            - listitem [ref=e73]:
              - link "Sitemap" [ref=e74] [cursor=pointer]:
                - /url: /sitemap
        - generic [ref=e75]:
          - paragraph [ref=e76]: Legal
          - list [ref=e77]:
            - listitem [ref=e78]:
              - link "Privacy" [ref=e79] [cursor=pointer]:
                - /url: /privacy
            - listitem [ref=e80]:
              - link "Terms" [ref=e81] [cursor=pointer]:
                - /url: /terms
            - listitem [ref=e82]:
              - link "Cookies" [ref=e83] [cursor=pointer]:
                - /url: /cookies
    - paragraph [ref=e85]: Copyright (c) 2026 Zooptrack. All rights reserved.
  - button "Open Next.js Dev Tools" [ref=e91] [cursor=pointer]
  - alert [ref=e95]
```

# Test source

```ts
  215 |             successful.length,
  216 | 
  217 |           failedUsers:
  218 |             failed.length,
  219 | 
  220 |           totalDurationMs:
  221 |             totalMs,
  222 | 
  223 |           averageUserDurationMs:
  224 |             results.length
  225 |               ? Math.round(
  226 |                   results.reduce(
  227 |                     (sum, r) =>
  228 |                       sum + r.durationMs,
  229 |                     0
  230 |                   ) / results.length
  231 |                 )
  232 |               : 0,
  233 | 
  234 |           results,
  235 |         };
  236 | 
  237 |         fs.mkdirSync(
  238 |           path.resolve("tests/results"),
  239 |           { recursive: true }
  240 |         );
  241 | 
  242 |         fs.writeFileSync(
  243 |           path.resolve(
  244 |             "tests/results/multi-user-report.json"
  245 |           ),
  246 |           JSON.stringify(
  247 |             report,
  248 |             null,
  249 |             2
  250 |           )
  251 |         );
  252 | 
  253 |         console.log("");
  254 |         console.log(
  255 |           "======================================="
  256 |         );
  257 |         console.log(
  258 |           " ZOOPTRACK ZERO-CREDIT MULTI-USER TEST"
  259 |         );
  260 |         console.log(
  261 |           "======================================="
  262 |         );
  263 |         console.log(
  264 |           `Users:                ${activeUsers.length}`
  265 |         );
  266 |         console.log(
  267 |           `Successful:           ${successful.length}`
  268 |         );
  269 |         console.log(
  270 |           `Failed:               ${failed.length}`
  271 |         );
  272 |         console.log(
  273 |           `Duration:             ${(totalMs / 1000).toFixed(1)}s`
  274 |         );
  275 |         console.log(
  276 |           "Paid scraper calls:   BLOCKED"
  277 |         );
  278 |         console.log(
  279 |           "SearchApi calls:      BLOCKED"
  280 |         );
  281 |         console.log(
  282 |           "ScrapeCreators calls: BLOCKED"
  283 |         );
  284 |         console.log(
  285 |           "Report: tests/results/multi-user-report.json"
  286 |         );
  287 |         console.log(
  288 |           "======================================="
  289 |         );
  290 |         console.log("");
  291 | 
  292 |         for (const result of results) {
  293 |           console.log(
  294 |             `${result.success ? "PASS" : "FAIL"} ` +
  295 |             `User ${result.userId} ` +
  296 |             `${result.email} ` +
  297 |             `scenario=${result.scenario} ` +
  298 |             `duration=${result.durationMs}ms`
  299 |           );
  300 | 
  301 |           if (result.errors.length) {
  302 |             for (const error of result.errors) {
  303 |               console.log(
  304 |                 `  ERROR: ${error}`
  305 |               );
  306 |             }
  307 |           }
  308 |         }
  309 | 
  310 |         expect(
  311 |           failed.length,
  312 |           failed.length
  313 |             ? `Some users failed. See tests/results/multi-user-report.json`
  314 |             : undefined
> 315 |         ).toBe(0);
      |           ^ Error: Some users failed. See tests/results/multi-user-report.json
  316 |       },
  317 |       10 * 60 * 1000
  318 |     );
  319 |   }
  320 | );
  321 | 
```
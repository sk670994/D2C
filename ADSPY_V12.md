# AdSpy v12

Fixes:
- Clicking an advertiser suggestion now immediately submits the exact Page ID search; it does not require a second click on Search.
- Autocomplete panel gets its own isolated stacking context so it cannot render underneath KPI/cards.
- Search clear icon uses public/adspy/icons/close.svg at 16x16.
- Creative play icon uses public/adspy/icons/play.svg at 18x18.
- Entire creative card is keyboard/mouse inspectable; nested media/source controls retain their own actions.
- Primary KPI row remains five cards; secondary metrics stay in the all-metrics rail.

Meta result-count note:
The Meta Ad Library website can display a much larger result set than this app's indexed creative library. The current app is showing records that have actually been collected/persisted into its own index. Meta's official Ad Library API has documented scope limitations for general commercial ads (for example, it covers all-ad types delivered to the UK/EU for the prior year, and political/social issue ads more broadly). It is therefore not valid to promise that the India commercial UI's "~980 results" can be reproduced with the same official endpoint without an authorized data source/provider. See the official Meta documentation.

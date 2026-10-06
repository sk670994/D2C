# Zooptrack design system v2: "slate & marigold"

Zooptrack is a competitive-intelligence desk for Indian D2C founders. The UI should read like analysis prepared by a sharp researcher, not a template dashboard. **Findings come first, the evidence (the ads) sits right under them, and colour is only used when it carries meaning.**

Tokens: `app/zt-tokens.css`. Product UI: `components/today/today.css`. AdSpy: `components/dashboard/adspy/adspy-design.css`. Never write a raw hex, font size, radius or shadow in a component. Use a token.

## Philosophy

- **Fewer containers.** A section starts with a top rule and a heading. It does not go inside a card. Cards (`zd-card`) are only for forms and other self-contained objects.
- **Hierarchy by type and position**, not by boxes. Primary content is large and dark. Metadata is small and muted. Figures use their own face.
- **Marigold means "something moved".** That covers the active page, new or long-running ads, the selected filter, and offer and price changes. Nothing else gets it.
- **Different screens, one language.** Today is editorial (ranked findings, generous space). AdSpy is dense and analytical (rules, aligned figures). Settings and billing are utilitarian. Sign-in is focused.

## Colour (semantic tokens)

| Token | Light | Use |
|---|---|---|
| `--zt-background` | `#edf0f2` cool porcelain | page |
| `--zt-surface` | `#ffffff` | data surfaces, inputs |
| `--zt-surface-ink` | `#18212b` | dark analytical surface (ZWIRK box, compare tray, avatars) |
| `--zt-text-primary / secondary / muted` | `#18212b / #3d4955 / #5f6b77` | text |
| `--zt-border-subtle / default / strong` | `#dfe4e8 / #cdd4da / ink` | rules; *strong* opens a section |
| `--zt-accent` | ink | primary action (buttons are ink, not blue) |
| `--zt-signal` | `#e8a317` marigold | change, newness, selection, active nav |
| `--zt-evidence` | `#2f4fae` | links to proof, provenance "derived" |
| `--zt-insight` | `#1d6b55` | "What to do", recommendations, live |
| `--zt-danger / warning` | `#b3321f / #9a5b00` | errors, low coverage |

Dark theme redefines the same tokens under `html[data-theme="dark"]`. Legacy `--zd-*` names are aliases. Don't use them in new code.

## Typography

- **Schibsted Grotesk** (`--zt-font-text`) is used for all words. It has newsroom origins: firm, compact, readable.
- **Archivo, expanded** (`--zt-font-figure`, `font-stretch` 112–125%, tabular numbers) is used for every number that matters: ad counts, days live, coverage, ranks and dates. Numbers must never look like body copy. Use `.zd-figure` / `.zd-num`, and `.zd-figure-xl` for hero metrics.
- Scale tokens: `--zt-type-display, h1, h2, h3, body, small, caption, label, metric`.
- Labels are sentence case with weight 600. No all-caps eyebrows, no monospace labels, no "A · B · C" meta strings (use spaced spans instead).

## Space, radius, shadow, motion

- Space: `xs 4 · sm 8 · md 14 · lg 22 · xl 32 · 2xl 48 · 3xl 72 · 4xl 104`. Use tight gaps for metadata, `lg` between related blocks, `2xl`+ between page sections.
- Radius varies by role:
  - `none`: shell, tables.
  - `sm 3`: chips, tags, badges, ad media.
  - `md 6`: buttons, inputs, data surfaces.
  - `lg 10`: search field, tray.
  - `xl 16`: dialogs.
  - Never pills.
- Shadows exist only on things that float (dropdowns, dialogs, tray): `--zt-shadow-medium/strong`. Nothing at rest has a shadow.
- Motion is 120–200 ms with `--zt-ease`. It answers an action (hover colour, dialog open, the media zoom on an ad). The only entrance animation is Today's lead finding. `prefers-reduced-motion` turns all of it off.

## Surfaces

1. **Bare page.** Text on `--zt-background`.
2. **Section** (`.zd-section`). A strong top rule plus a heading.
3. **Data surface** (`.zd-card`). White, subtle border, `md` radius. Used for forms.
4. **Field** (`.zd-field`, `.zd-todo`). A tinted area for something to read or act on.
5. **Ink** (`.zd-ink`). The dark analytical block, used once per screen at most.
6. **Image-led** (`.zd-tile`, ad media).
7. **Metric strip** (`.azs-strip`, `.azs-snapshot`). Figures in a row, divided by rules.

## Components

- **Shell.** Left rail with grouped navigation (Watch / Act / Account). The active page gets a 3px marigold notch on the rail edge, never a filled pill. On phones the rail becomes a top bar with a scrolling tab row, and the notch moves under the active tab.
- **Buttons.**
  - Primary: ink fill, one per view.
  - Secondary: outline.
  - Tertiary (`.zd-btn-text`): a link-like button.
  - Destructive (`.zd-btn-danger`).
  - Contextual: AdSpy's `azs-btn-ghost`, which goes marigold when on.
- **Inputs.** `md` radius. On focus the border turns ink with a marigold underline. The AdSpy search is the largest control in the product: 54px tall, `lg` radius.
- **Badges** (`.zd-pill-*`). Rectangular, tinted by meaning: big push = solid marigold, changed = marigold outline, staying = insight green, quiet = neutral.
- **Ranked findings** (`.zd-lead`, `.zd-moves`). The rank number is set in Archivo, with marigold for #1. Numbering is used because moves *are* ranked.
- **Ad card** (AdSpy).
  - Structure: media, then a ruled byline (advertiser, days live), then copy, CTA, status and tags.
  - Variants come from data attributes:
    - `data-format="video"`: dark frame, square play mark.
    - `data-format="carousel"`: stacked frames behind the first.
    - `data-media="no"`: the copy becomes the picture.
    - `data-long="yes"`: the days count turns marigold.
- **Filters.** A ruled column, not a card. The selected row gets a marigold tint and an ink checkbox. The count bar turns marigold only when selected.
- **Empty states.** A marigold left rule, a heading that says what to do, and a short line. No illustrations.
- **Loading.** Skeleton blocks in the content's own shape. Spinners only inside the control that is working.
- **AI / ZWIRK.** Presented as analysis. Prompts are plain rows on the ink surface. No sparkles, no gradients, no purple.

## Accessibility

- Text contrast is at least 4.5:1 in both themes. Marigold is never used for text on light backgrounds; text uses `--zt-signal-ink`.
- Every interactive element has a visible `:focus-visible` outline (`--zt-focus`).
- Touch targets are at least 38px on desktop and 44px for phone tabs.
- Navigation groups use `role="group"` with labels. The active page uses `aria-current="page"`.

## Responsive

- **≤1180px:** the Today aside drops below the content as two columns.
- **≤860px:** the rail becomes a top bar. AdSpy filters collapse behind their toggle, ads go two per row, the search stacks, and dialogs become bottom sheets.
- **≤560px:** ranks shrink. Move actions move under their text.

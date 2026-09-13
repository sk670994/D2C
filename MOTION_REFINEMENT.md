# Zooptrack AdSpy — Motion Refinement

Target: clean white SaaS UI, medium motion, no green/teal visual language.

## Library review and selection

### React Bits — selected: AnimatedList pattern
React Bits has a large catalog of copy-ready animated React components and explicitly ships an AnimatedList component. We selected its list-entry / presence-motion behavior for the AdSpy intelligence ticker instead of using its more decorative backgrounds or 3D effects.

Source:
https://github.com/DavidHDev/react-bits/tree/main/src/ts-tailwind/Components/AnimatedList

### Vengeance UI — selected: Animated Number
Vengeance UI provides Animated Number, Stats Counter, Stagger Text, Glow Border Card and other interaction components. Animated Number is the strongest fit for Zooptrack KPI tiles, so the stats now use rolling digit transitions.

Source:
https://github.com/Ashutoshx7/VengeanceUI/blob/main/src/components/ui/animated-number.tsx

### Skiper UI — selected: reveal / expandable-card motion
Skiper's Image Reveal and Minimal Card Expand patterns are useful for a creative intelligence product. We kept the effect restrained: media gets a tiny scale/reveal treatment rather than a flashy 3D interaction.

Sources:
https://skiper-ui.com/v1/skiper71
https://skiper-ui.com/v1/skiper23

### Animmaster — selected: Showmore progressive disclosure
Animmaster's Showmore component is designed around progressive disclosure with height-based animation and data attributes. The AdSpy creative card now uses the same interaction philosophy for long primary copy.

Source:
https://animmaster.github.io/docs/showmore.html

## Integration files

- `components/ui/adspy/ReactBitsAnimatedList.tsx`
- `components/ui/adspy/VengeanceAnimatedNumber.tsx`
- `components/ui/adspy/SkiperReveal.tsx`
- `components/ui/adspy/AnimmasterShowMore.tsx`
- `components/dashboard/adspy/components/AdSpyLoadingIntelligence.tsx`
- `components/dashboard/adspy/components/AdSpyStats.tsx`
- `components/dashboard/adspy/components/AdSpyCreativeCard.tsx`
- `components/dashboard/adspy/components/AdSpyToolbar.tsx`
- `components/dashboard/adspy/components/AdSpySearchBar.tsx`
- `components/dashboard/adspy/adspy-motion-grid.css`

## One import to add

Import `adspy-motion-grid.css` from an existing global AdSpy stylesheet or from the AdSpy section's client entry, depending on the project's current CSS architecture.

Example:

```tsx
import "./adspy-motion-grid.css";
```

## Resulting experience

- KPI row: 5 compact cards on desktop.
- Creative library: 5 compact cards per row at >=1280px, 3 per row on large tablets/desktops below that, with responsive fallback from the existing grid.
- Search: cleaner spacing between keyword/advertiser controls and a calmer suggestion reveal.
- Intelligence loader: rotating GK facts, market observations, Zooptrack notes and Santa-Banta jokes using the React Bits-style presence transition.
- Creative cards: smaller footprint, restrained reveal motion and expandable copy.
- Track state: blue/slate instead of green.
- Exact advertiser state: blue/slate instead of green.

## Remaining color cleanup

The current main branch also contains older green/emerald classes in `AdSpySection.tsx` and `AdSpyCreativeModal.tsx`. Those are intentionally not duplicated in this patch because both files are large and currently contain unrelated production logic. Replace those remaining emerald states with the same slate/blue treatment used by the files above.

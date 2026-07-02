# Design System — Social Audit Dashboard

Dark, local-first creator cockpit. One CSS file (`src/styles.css`), tokens in `:root`. Every macro visual decision maps to a token below; if you're typing a raw px or rgba value for spacing or surface color, stop and use a token.

## Color

- Canvas: `--bg` #0e1014, `--bg-deep` #090b0f. Never pure black/white.
- **Single white-point**: all surface tints derive from `rgba(244, 247, 255, α)` (cool, matches `--panel`). No `rgba(255,255,255,…)` or warm `rgba(248,245,238,…)` in component CSS.
- **Tint ladder** (surface elevation, use instead of ad-hoc alphas):
  - `--tint-1` (0.02) resting nested surface
  - `--tint-2` (0.035) emphasized panel body
  - `--tint-3` (0.055) highlighted / selected
  - `--tint-4` (0.075) strongest highlight
  - `--well` / `--well-soft` recessed dark fills (meters, draft blocks, fact chips)
- Accent: `--accent` electric lime, filled button reserved for the single primary CTA per view. Status hues come only from `--green` / `--amber` / `--danger`; alpha-blend those exact RGB values for borders/backgrounds (no near-miss greens/ambers/reds).

## Spacing

4px scale (`--space-1..8`) plus four semantic tokens that carry the layout:

| Token | Value | Use |
|---|---|---|
| `--stack` | 16px | vertical rhythm between workspace sections |
| `--pad-panel` | 20px | top-level panel, modal, shelf-row header padding |
| `--pad-card` | 16px | feature cards, grid cells, slot bodies |
| `--pad-cell` | 12px | compact tiles, nested rows, inner list padding |

Micro text rhythm (label→title→body gaps of 4–10px) is free-form; everything at component scale is tokenized. Gaps: 8px chips/lists, 12px card lists, 16px grids.

## Disclosure component

All `<details>` expand/collapse rows share one component: class `disclosure` on the element, summary children in `span` (kicker) / `strong` (title) / `small` (hint) order, `+`/`−` toggle rendered by CSS.

- `disclosure` — base: radius-sm, 30px toggle, 64px summary
- `disclosure-panel` — top-level shelf rows: radius, gradient tint-3→tint-1, 32px toggle, 72px summary
- `disclosure-compact` — dense rows inside cards: 28px toggle, 56px summary
- `disclosure-flush` — borderless row inside a container (top border only)

Per-feature classes (`draft-library`, `coach-details`, …) remain only for margins and unique interiors. Do not restyle summaries per feature.

## Type

- Display: Space Grotesk (400/500/700), body: Inter (400/500/600/700). **Only loaded weights** — no 560/580/620.
- Kickers: 11px / 700 / uppercase / `--faint` (10px in compact disclosures).
- Hierarchy by size + weight; h1 42, h2 21, card titles 16–17.

## Nesting

Panel radius `--radius` (14) → nested blocks `--radius-sm` (8). Every bordered nested block has a radius; flush rows inside a bordered container use borders, not radius. Nested cards never sit on the same tint as their parent — step one rung on the ladder.

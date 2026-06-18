# Vicinity Design System — Aman direction (v3)

Adopted: 2026-06-18. Replaces the dark ink + gold tokens that lived since pre-launch demo.

## Why Aman
Top-tier luxury sites (Aman, 111 W 57, Naftali, Related) audited 2026-06.
Common signal: full-bleed media, **no chromatic accent color**, display serif + tracked-caps sans, B&W or warm-cream palette. Vicinity v3 follows.

## Palette (light, warm)
| Token        | Value                       | Use                                      |
|--------------|-----------------------------|------------------------------------------|
| `bg`         | `#f3eee7` (cream)           | page background                          |
| `surface`    | `#fbf8f3` (paper)           | cards, modals                            |
| `ink`        | `#313131` (warm black)      | primary text, primary buttons            |
| `ink2`       | `#5a5651`                   | secondary text                           |
| `muted`      | `#8a857d`                   | tertiary, captions, eyebrows             |
| `line`       | `rgba(49,49,49,0.14)`       | hairlines, dividers, card borders        |
| `line-strong`| `rgba(49,49,49,0.32)`       | active borders, focus rings              |

**No gold. No bronze. No accent color.** Hover/active states use ink shifts and underline animation, not chromatic accents.

## Type
- **Display serif**: `Source Serif 4` (next/font/google). H1 / H2 / hero titles.
- **Text sans**: `Inter`. Body, eyebrows, UI labels.
- **Eyebrow caps**: Inter 11px / 500 / `letter-spacing: 0.22em` / uppercase.
- **Display sizing**: 48–72px headings use `letter-spacing: -0.02em`.

## Layout idioms
- Full-bleed hero media (image now, video when real footage arrives).
- 1px hairline dividers in `line` color, never heavier.
- Generous whitespace; min vertical rhythm 32px between sections.
- CTAs: ink-fill primary, ink-bordered ghost. No rounded-full party buttons; corners 0–6px.

## Accessibility
- Body text contrast: `#313131` on `#f3eee7` = 11.6:1 (WCAG AAA).
- Muted text floor: `#8a857d` on `#f3eee7` = 4.7:1 (AA Large only — never use for body).
- Focus ring: 2px `line-strong` offset 2px.
- Min tap target: 44×44px.

## Migration scope (phase 38)
**Token swap covers ~80% of surfaces automatically.** Routes listed below get hand-tuned typography + spacing:
1. `/` lander
2. `/a/[agentSlug]` agent profile
3. `/browse` swipe feed
4. `/v/[agentSlug]/[listingSlug]` listing detail

Deferred (cosmetic-only token swap, no hand-tune):
- `(auth)/*`, `dashboard/**`, `profile/`, `saved/`, `nearby/`, `communities/*`

## Revert
```bash
git reset --hard pre-aman-redesign && git push -f origin main
```
Backup branch: `backup/pre-aman-redesign`.

# Ley81·Suite brand guide (as built in the app)

## Logo
- **Mark ("1d")**: a ring containing the "8" as two stacked rings, a vertical bar for the "1", and a small accent dot between them. Files: `logo/ley81-mark-navy.svg`, `logo/ley81-mark-white.svg` (for dark backgrounds), PNGs at 1024px alongside.
- **App icon**: navy rounded square with the white mark: `logo/ley81-app-icon.svg`, `icons/app-icon-*.png`, `icons/favicon.*`, `icons/apple-touch-icon.png`, `icons/android-chrome-*.png`.
- **Lockup**: mark + "Ley81·Suite" wordmark: `logo/ley81-lockup-navy.svg` / `-white.svg`. These use live text in Source Serif 4 (semibold); load the fonts from `brand/fonts/` or the lockup falls back to Georgia. Convert to outlines before using it anywhere the font isn't loaded.
- The middle dot in the wordmark is always the accent colour. Don't stretch, recolour, or add effects. Keep clear space of at least half the mark's width.
- No logo variations beyond navy / white. White-labelling is deliberately not offered to consulting firms.

## Colour
| Role | Hex |
|---|---|
| Ink navy (brand, headings, mark) | `#1b3a5c` (deep: `#12283f`) |
| Accent teal (links, dot, highlights) | `#0088b0` (on dark backgrounds use `#2bb3dd`) |
| Page background | `#f3f2f2`; surface `#eae9e9`; white paper `#ffffff` |
| Text | `#201e1d` |
| Success / warning / danger | `#2f7d4f` / `#9a5b12` / `#aa0b56` |
| Secondary accent (rare, alerts) | magenta `#d6006c` |

The app's full token set is in `assets/design-mockups/_ds/` (the "Broadsheet" design system) and `Ley81-Suite/app/src/index.css`.

## Type
- **Source Serif 4**, weights 400/600, normal and italic (self-hosted woff2 in `fonts/`, SIL OFL licence included). Used for headings *and* body in the app.
- Large hero wordmark in the app uses a CMYK mis-registration treatment (`.cmyk-head` in the app's CSS): reserve it for one hero moment, not general use.

## Voice
Plain and precise. Bilingual (ES/EN). Lead with what the product does for a consultant or a compliance officer; avoid hype and unverifiable claims (see `docs/PRODUCT_OVERVIEW.md` for what can be said).

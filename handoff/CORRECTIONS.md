# CORRECTIONS — read this FIRST (fixing the current build)

The redesign has been partially implemented but **regressed** in three areas: **fonts**,
**a few UI elements**, and **several labels**. This file is the authoritative punch‑list
to bring the current app back to the prototype. It supersedes any conflicting wording
elsewhere in this bundle.

> **Golden rule:** when this prose and the prototype disagree, **the prototype wins.**
> The source of truth for every visual, string, size, and component is, in order:
> 1. `prototype/screen-*.jsx` + `prototype/ui.jsx` + `prototype/sidebar.jsx` (exact markup, sizes, copy)
> 2. `prototype/styles.css` (tokens)
> 3. `screenshots/*.png` (target render)
>
> Earlier docs (README/CHECKLIST) paraphrased the prototype and **drifted** in a few
> places — those paraphrases are what got implemented incorrectly. Don't trust the prose;
> open the prototype file for the screen you're touching and match it line‑for‑line.

---

## Paste this to Claude Code (run against the CURRENT repo)

```
The Tatú redesign is implemented but has regressions vs the design in
design_handoff_tatu_redesign/. Fix them in this order. After each section, run
`npm run tdd:verify` and show me the diff. Do NOT restructure working code —
these are surgical fixes.

1. TYPOGRAPHY (highest priority — fonts are wrong). See CORRECTIONS.md §A.
   - There must be exactly ONE typography source. Delete the leftover Figma file
     src/styles/typography.css (it redefines --font-sans:Inter and
     --font-display:'Space Grotesk' and re-points h1/h2 — these override the
     intended fonts wherever it loads). Also delete src/utils/figma-data.ts if
     nothing imports it, and drop any "Figma Design System" leftovers.
   - Keep src/styles/fonts.css (Spectral + Hanken Grotesk + JetBrains Mono only)
     and src/styles/theme.css as the only places that set font variables.
   - Verify at RUNTIME (not just in CSS): an <h1> computes to Spectral, body text
     to Hanken Grotesk, and .font-mono/.amt to JetBrains Mono. Confirm the
     "Hola, …" greeting renders as a SERIF (it currently renders sans-serif).

2. LABELS. See CORRECTIONS.md §B — apply the exact strings table. Most important:
   the dashboard panel title must be "Este mes, todo en dólares/pesos" + the
   subtitle, NOT "Este mes".

3. UI ELEMENTS. See CORRECTIONS.md §C — match MiniBars, the account-card footer
   (movements count + "≈ converted"), the account sub-line (include masked number),
   and remove the extra sparkline under Gastos.

4. Verify against CORRECTIONS.md §D and the screenshots in screenshots/ (light + dark).
   Keep all tests green; add/adjust tests where copy or structure changed.
```

---

## §A — Typography (the #1 regression)

**Symptom:** headings render in a geometric sans (Space Grotesk) and body in Inter;
the prototype uses **Spectral** (serif) for headings, **Hanken Grotesk** for UI, and
**JetBrains Mono** for all amounts. In the target screenshot the "Hola, José 👋"
greeting is unmistakably a **bold serif**; in the current build it is sans‑serif.

**Root cause:** there are two competing typography definitions in `src/styles/`:

| File | Defines | Keep? |
|---|---|---|
| `theme.css` | `--font-sans: 'Hanken Grotesk'`, `--font-display: 'Spectral'`, `--font-mono: 'JetBrains Mono'` + `h1/h2 { font-family: var(--font-display) }` | ✅ **the correct one** |
| `fonts.css` | `@import` Spectral + Hanken Grotesk + JetBrains Mono | ✅ keep |
| `typography.css` | `@import` **Inter** + **Space Grotesk**; `--font-sans: 'Inter'`; `--font-display: 'Space Grotesk'`; its own `@layer base h1/h2 { font-family: var(--font-display) }` | ❌ **DELETE** — Figma leftover |

Whenever `typography.css` is in the bundle (or gets imported during a refactor) it
wins the cascade and silently swaps the whole app to Inter/Space Grotesk. Delete it so
the wrong fonts can't come back. Then make sure `src/index.css` imports only:

```
@import './styles/fonts.css';
@import './styles/tailwind.css';
@import './styles/theme.css';
```

**Exact font per element** (must match after the fix):

| Element | Family (var) | Notes |
|---|---|---|
| Page greeting `h1` (Resumen) | `--font-display` Spectral | **30px / 600**, `letter-spacing:-0.02em`. (Build currently 26/700 — fix size + weight.) |
| Other `h1`, `h2` section titles | per prototype | section titles are 15–16px/600 in `--font-sans`, NOT display — see prototype `.section-title`. Only the page title + brand wordmark use Spectral. |
| Body / UI text, buttons, nav | `--font-sans` Hanken Grotesk | base 15px / 1.5 |
| Brand wordmark "Tatú" | `--font-display` Spectral | 22px/600 |
| **All amounts / numbers / dates-in-tables** | `--font-mono` JetBrains Mono | `font-variant-numeric: tabular-nums` (use `.amt` / `.font-mono`) |

**Runtime verification (add a test or check in devtools):**

```ts
// the var must resolve to Spectral, and NO file may define Space Grotesk/Inter
getComputedStyle(document.documentElement).getPropertyValue('--font-display') // → Spectral…
getComputedStyle(document.querySelector('h1')!).fontFamily                    // → contains "Spectral"
getComputedStyle(document.querySelector('.amt')!).fontFamily                  // → contains "JetBrains Mono"
```
Plus a grep guard in CI: `grep -R "Space Grotesk\|'Inter'" src/styles` must return nothing.

---

## §B — Labels (exact strings; left = WRONG in build, right = TARGET)

Open the screenshot `screenshots/01-resumen-light.png` alongside this.

| Location | Current build | **Target (use this)** |
|---|---|---|
| Dashboard panel title | `Este mes` | **`Este mes, todo en dólares`** when home=USD / **`…en pesos`** when home=UYU (suffix tracks the toggle) |
| …its subtitle | *(missing)* | **`Combina tus movimientos en US$ y $U usando el tipo de cambio.`** (faint, 12px, directly under the title) |
| Account-card footer (left) | `314 movimientos este período` | **`{n} movimientos`** |
| Account-card footer (right) | *(missing)* | **`≈ {amount converted into home currency}`** (mono, faint) — the cards are a `space-between` row: count left, converted right |
| Account sub-line | `Santander Mastercard` / `Caja de ahorro USD` | include the **masked number**: `{sub} ·· {last4}` → e.g. `Caja de ahorro USD ·· 8226` (use the real account's label + last 4 digits; don't hardcode a card brand) |
| Gastos native caption | `US$ 33,60 + $U 1.175,00 nativo` | **`US$ 33,60 + $U 1.175,00`** (drop the trailing "nativo"; match prototype `splitNote`) |

**Do NOT "fix" the greeting back to a hardcoded name.** `Hola, {firstName} 👋` derived
from the signed-in user is correct and intended — the prototype only hardcodes "José"
because it has no auth. Keep it dynamic.

All other strings (nav: Resumen/Transacciones/Análisis/Categorías/Configuración; brand
sub `GASTOS · URUGUAY`; `Consumo del período` / `Saldo disponible`; `Ver análisis
completo →` / `Detalle` / `Ver todos →`; `transacciones registradas`) already match — leave them.

---

## §C — UI elements that drift from the prototype

Reference: `prototype/ui.jsx` (`MiniBars`) and `prototype/screen-overview.jsx`.

1. **`MiniBars` sparkline — match the prototype exactly.** Build uses `height:24, gap:2`,
   last bar opacity 1 / others 0.35, `minHeight:3px`. Prototype is:
   ```jsx
   // height 36, gap 3, opacity RAMPS across bars, min 6% height
   <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:36 }}>
     {values.map((v,i)=>(
       <div style={{ flex:1,
         height: `${Math.max((v/max)*100, 6)}%`,
         background: color, borderRadius:2,
         opacity: 0.25 + 0.75*(i/values.length) }}/>
     ))}
   </div>
   ```
   The opacity *ramp* (older bars faded, newest fully opaque) is the look — not a single
   highlighted last bar.

2. **Sparkline placement in "Este mes".** Prototype puts a MiniBars **only under
   Ingresos**. Gastos shows the **native split caption** (`US$ X + $U Y`) and **no
   sparkline**; Balance neto shows **`{n} transacciones registradas`** and no sparkline.
   The build added a second sparkline under Gastos — **remove it.**

3. **Account-card footer** is a two-part row (see §B): `{n} movimientos` on the left,
   `≈ {converted}` mono on the right, faint 11.5px, top border. The build dropped the
   converted value and changed the label.

4. **Account sub-line** must include the masked account number (§B). The icon tile is
   correct (36px, radius 10, `--surface-2` bg, `--brand` icon) — leave it.

Everything else on Resumen (3‑card grid `repeat(3,1fr)` gap 16; two‑column `1fr 1.15fr`
grid; category rows with color dot + 7px progress track; recent rows with category emoji
tile + `≈ converted` secondary when currency≠home) already matches the prototype — verify
but don't rebuild.

---

## §D — Verification checklist

- [ ] `grep -R "Space Grotesk\|'Inter'" src` → empty; `src/styles/typography.css` deleted.
- [ ] Greeting renders as a **serif** (Spectral); amounts render as **JetBrains Mono**; body is **Hanken Grotesk** (check `getComputedStyle`).
- [ ] Page title is 30px/600; section titles are 15–16px/600 sans (not display, not 700).
- [ ] Dashboard panel says **"Este mes, todo en dólares/pesos"** + subtitle; toggling the currency flips the suffix.
- [ ] Each account card: sub includes `·· {last4}`; footer shows `{n} movimientos` (left) + `≈ {converted}` (right).
- [ ] Only **one** sparkline in "Este mes" (under Ingresos), with the opacity ramp.
- [ ] Compare each screen side‑by‑side with `screenshots/` in **both** light and dark.
- [ ] `npm run ci:check` passes (tests + lint + build).

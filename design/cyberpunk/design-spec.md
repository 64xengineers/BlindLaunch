# Blindlaunch design spec: "Blind Run"

For the builder of the clickable prototype. Read with `brief.md` (product rules) only if you need background; everything you need to build is here. Checked 13 Oct 2026: contrast with the WCAG formula, font metrics with fontTools, CDN and Google Fonts URLs (HTTP 200), spring curves by simulation.

Wireframe legend (all wireframes are 390 px phone, about 40 characters wide):

| Mark | Means |
|---|---|
| `((LABEL ▸))` | the one primary (yellow) button on that screen |
| `(Label)` | secondary button (cyan outline) |
| `[x]` | chip, preset, radio card or toggle |
| `<WORD>` | status chip or sticker |
| `{i:name}` | inline SVG icon from §5.22 |
| `@pose` | Hush the mascot in that pose (§4) |
| `▸ Label` | collapsed `<details>` |
| `▓▓▓░░` | the progress meter |
| `╔═╗` | paper surface (receipt slip, comic panel) |

---

## 1. Concept

**Name: Blind Run.** A cel-shaded mission comic on an ultraviolet night.

**Pitch.** Every launch is a mission card, every bid is a padlock you slam shut, and every result is a loot drop. Thick black ink around bright flat colour, hard "misprint" shadows in magenta, and paper receipts make money matters readable at a glance. A thin HUD layer (hairlines, cut corners, a mission tracker) keeps the numbers exact, and Hush, a walking padlock, tells you what to do next.

**Signature moment: The Clamp.** When you press "Lock in my bid", your paper receipt flies into Hush's body, leaving cyan, magenta and yellow afterimages. His shackle slams shut, a "KA-CHUNK" sticker pops, and a LOCKED stamp lands. Nothing else in the product moves as much (§6.2).

Two layers, never mixed on one element:
- **HUD skeleton:** dark panels, 2px `--line` outline, one bottom-right cut corner, corner ticks, small uppercase state labels. Used for frames, facts, lists, the tracker, proof.
- **Cartoon skin:** bright flat fills, 3px black ink outline, a hard magenta offset shadow, stickers, the mascot. Used for actions, the receipt, outcomes and hero moments.

---

## 2. Tokens

**Single theme, dark only.** The prototype has no light mode and no theme switch. `color-scheme: dark`.

### 2.1 Colour

| Token | Hex | Role |
|---|---|---|
| `--void` | `#0D0920` | top bar, bottom nav, ticker, modal scrim (85%), boot screen |
| `--night` | `#1C1242` | page background (ultraviolet, not black) |
| `--panel` | `#2A1D5E` | HUD panels and cards |
| `--raised` | `#3A2A7A` | inputs, unselected chips, hover on panels |
| `--paper` | `#F6F1E1` | receipt slip, comic panels, toasts, tooltips, speech bubbles |
| `--ink` | `#000000` | outlines around bright fills, all text on bright fills and paper |
| `--line` | `#7D70B8` | 2px panel outlines, 1px hairlines. **Never text.** |
| `--text` | `#F6F1E1` | body text on dark |
| `--muted` | `#C2B8E8` | secondary text on dark |
| `--yellow` | `#FCEE0A` | the one primary button, LIVE, WON |
| `--cyan` | `#00F0FF` | your secret bid, selected chips, UNLOCKING, FAIR SHARE, focus ring, links |
| `--magenta` | `#FF2A6D` | pop shadows, READY, Hush's body, hype stickers |
| `--coral` | `#FF6154` | errors, STUCK, MISSED, last minute |
| `--green` | `#05FFA1` | money back, DONE, trading, MONEY BACK |
| `--violet` | `#B48CFF` | STARTS SOON, demo controls |
| `--magenta-shade` | `#C2185B` | Hush cel shade (decoration only) |
| `--steel` | `#D8DCF0` | Hush shackle (decoration only) |

Contrast (text colour on background):

| Text ↓ / bg → | void | night | panel | raised | paper |
|---|---|---|---|---|---|
| `--text` | 17.3 | 15.3 | 13.0 | 10.4 | – |
| `--muted` | 10.5 | 9.3 | 7.9 | 6.3 | – |
| `--yellow` | 16.1 | 14.3 | 12.1 | 9.7 | ✗ |
| `--cyan` | 13.8 | 12.3 | 10.4 | 8.3 | ✗ |
| `--green` | 14.7 | 13.0 | 11.0 | 8.8 | ✗ |
| `--violet` | 7.6 | 6.7 | 5.7 | 4.5 | ✗ |
| `--coral` | 6.6 | 5.8 | 4.9 | ✗ 4.0 | ✗ |
| `--magenta` | 5.4 | 4.8 | ✗ 4.0 | ✗ 3.2 | ✗ |
| `--ink` | ✗ 1.1 | ✗ 1.2 | ✗ 1.4 | ✗ 1.8 | 18.6 |

Black on fills: yellow 17.4, green 15.8, cyan 14.9, violet 8.1, coral 7.1, magenta 5.8.

Rules:
1. Text on any accent fill or on paper is always `--ink`. Never white on an accent.
2. Accent-coloured text only on void, night or panel. Coral text never on raised. Magenta text only at 24px or larger, on void or night.
3. Never coloured text on paper: use black text with a coloured icon chip.
4. `--line`, `--magenta-shade` and `--steel` are never text.
5. **Black ink is invisible on the dark surfaces (1.1 to 1.8:1).** So black outlines go only around bright fills, and every hard shadow that lands on a dark surface is magenta (`--pop`). Use cyan (`--pop-alt`) when the element itself is magenta or coral.
6. State is always colour + icon + word, never colour alone.

### 2.2 Type

Three families from Google Fonts, plus system mono:

| Role | Family | Weights | Fallback |
|---|---|---|---|
| Everything textual (display, UI, body, buttons) | **Chakra Petch** | 500, 600, 700, 700 italic | `"Arial Narrow", system-ui, sans-serif` |
| Every number (prices, money, counts, timers) | **Oxanium** | 700, 800 | `ui-monospace, Menlo, monospace` |
| Shout words on stickers and loot only | **Dela Gothic One** | 400 | `Impact, "Arial Black", sans-serif` |
| Addresses and hashes | system | – | `ui-monospace, Menlo, monospace` |

Oxanium digits are tabular by default (verified), so timers don't jitter. Chakra Petch has no tabular figures, so never set a changing number in it. Dela Gothic One is uppercase-only here and loaded as a subset.

Type scale (phone below 1024px / desktop from 1024px):

| Token | Family, weight | Phone | Desktop | Line height | Use |
|---|---|---|---|---|---|
| `shout-xl` | Dela 400 | 44 | 72 | 0.95 | loot word (WON) |
| `shout-md` | Dela 400 | 22 | 28 | 1 | stamps, SFX, LIVE NOW tab |
| `display` | Chakra 700 | 40 | 64 | 1.0, −0.01em | home H1 |
| `h1` | Chakra 700 | 30 | 44 | 1.05 | screen titles |
| `h2` | Chakra 700 | 22 | 28 | 1.15 | section and card titles |
| `body-lg` | Chakra 500 | 18 | 20 | 1.45 | subheads, receipt labels |
| `body` | Chakra 500 | 17 | 18 | 1.5 | body text |
| `small` | Chakra 600 | 15 | 15 | 1.4 | helpers, captions, field labels |
| `label` | Chakra 700, UPPERCASE, +0.08em | 13 | 14 | 1.2 | chips, tracker, stat labels |
| `btn` | Chakra 700 italic, UPPERCASE, +0.04em | 20 | 22 | 1.1 | primary button |
| `num-hero` | Oxanium 800 | 64 | 120 | 0.9 | final price |
| `num-xl` | Oxanium 700 | 48 | 72 | 0.95 | countdown |
| `num-lg` | Oxanium 700 | 26 | 32 | 1 | receipt and loot values |
| `num-md` | Oxanium 700 | 18 | 20 | 1.1 | stats, price chips |

Uppercase only for state labels of 3 words or fewer, primary buttons and stickers. Sentence case everywhere else. Body text never below 15px. Lines at most 68 characters (`max-width: 34em` on paragraphs).

Number formats:
- Prices: 3 decimals, `$0.020`.
- Money in receipts, loot and toasts: 2 decimals, `$500.00`.
- Bid money, presets and the raise in labels: whole dollars, `$1,000`.
- Token amounts: thousands separators, no decimals, `25,000 NCAT`.
- Countdown: under 1 hour `14:32`; under a day `2:10:44`; otherwise `2d 04h`.

### 2.3 Space, size, borders, shadows, corners, layers

- **Space** (4-point): `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24, `--s6` 32, `--s7` 48, `--s8` 64, `--s9` 96.
- **Gutters:** 16px phone, 24px from 640px, 32px from 1024px. Max content width 1200px.
- **Card padding:** 16 phone, 24 desktop. Gap between sections: 48 phone, 64 desktop.
- **Targets:** minimum 44×44. Chips 48 tall. Primary button 60 tall on phone, 64 on desktop.
- **Borders:**
  - `--bw-ink` 3px black, around bright fills.
  - `--bw-line` 2px `--line`, around dark panels and inputs.
  - Secondary buttons: 2px `--cyan`.
  - `--bw-hair` 1px `--line` at 60%, for HUD dividers.
- **Focus:** `outline: 3px solid var(--cyan); outline-offset: 3px`. On cyan-filled elements use `--paper`. Never removed.
- **Shadows**, hard and zero blur:
  - `--pop-sm: 3px 3px 0 var(--magenta)` (selected chips)
  - `--pop: 4px 4px 0 var(--magenta)` (primary button, toasts)
  - `--pop-md: 6px 6px 0 var(--magenta)` (featured card, receipt slip, modal)
  - `--pop-lg: 10px 10px 0 var(--magenta)` (loot card)
  - `--pop-alt`: the same offsets in `var(--cyan)`, for magenta or coral elements (Hush never casts one; the MISSED card and the creator card do)
  - On paper surfaces, shadows of the elements inside are black (`4px 4px 0 #000`).
  - Glow, only on numbers 40px or larger: `text-shadow: 0 0 18px rgb(252 238 10 / .45)` on the yellow final price. No other glow.
- **Cut corners:** one notch, always bottom-right. `--cut-s` 8px (chips, inputs, icon chips), `--cut-m` 14px (buttons, cards, toasts), `--cut-l` 24px (loot card, featured card, modal).

  Recipe that keeps the outline and shadow on every browser. Don't clip the element itself, because `clip-path` would also clip focus outlines and shadows:

  ```css
  .cut{--c:var(--cut);position:relative;isolation:isolate;filter:drop-shadow(var(--sh,0 0 0 transparent))}
  .cut::before,.cut::after{content:"";position:absolute;z-index:-1;
    clip-path:polygon(0 0,100% 0,100% calc(100% - var(--c)),calc(100% - var(--c)) 100%,0 100%)}
  .cut::before{inset:0;background:var(--edge)}               /* outline colour */
  .cut::after{inset:var(--bw);background:var(--fill);--c:calc(var(--cut) - var(--bw)*.6)}
  ```

  For shadows on cut shapes, use `filter: drop-shadow(4px 4px 0 var(--magenta))` (it follows the notch), not `box-shadow`.
- **Z layers:**

  | z | Layer |
  |---|---|
  | 0 | page background and skyline |
  | 1 | content |
  | 20 | top bar, ticker, bottom nav |
  | 30 | demo tab and demo panel |
  | 40 | tooltips and popovers |
  | 50 | modal and scrim |
  | 60 | toasts |
  | 70 | Clamp and reveal overlays |
  | 80 | boot intro |
  | 90 | confetti canvas (`pointer-events:none`) |
  | 100 | skip link |

- **Easing:**
  - `--ease-out: cubic-bezier(.2,.9,.25,1)`
  - `--ease-in: cubic-bezier(.7,0,1,.5)`
  - `--ease-swap: cubic-bezier(.7,0,.2,1)`
  - `--spring` (11% overshoot; use at 480ms for "pop" and 350ms for "clamp"):
    `linear(0, 0.067, 0.224, 0.419, 0.616, 0.789, 0.926, 1.023, 1.082, 1.111, 1.115, 1.104, 1.084, 1.061, 1.039, 1.02, 1.005, 0.995, 0.989, 0.987, 0.987, 0.988, 0.991, 0.994, 1)`
  - `--spring-soft` (1% overshoot, 450ms):
    `linear(0, 0.039, 0.134, 0.252, 0.381, 0.502, 0.614, 0.709, 0.79, 0.853, 0.903, 0.94, 0.968, 0.986, 0.999, 1.007, 1.011, 1.013, 1.013, 1.012, 1.011, 1.009, 1.008, 1.006, 1)`

---

## 3. Texture and ornament

| Ornament | Recipe | Allowed | Banned |
|---|---|---|---|
| **Skyline** | Fixed inline SVG at the page bottom, max 180px tall. Flat `--void` buildings with a few 3×4px windows in yellow and cyan at 60%. | Page background only | – |
| **Grain** | SVG `feTurbulence` (baseFrequency .9) as a data URI, 5%, `mix-blend-mode:overlay`, static | Page background, boot screen | Panels, paper, anything animated |
| **Halftone** | `radial-gradient(circle, rgb(255 42 109/.35) 1.4px, transparent 1.6px) 0 0/8px 8px`, faded with a radial `mask` | Home hero corner behind Hush, behind the loot card, Clamp overlay, inside comic panels behind drawings | Under any text, inside the receipt, forms, lists |
| **Scanlines** | `repeating-linear-gradient(0deg, rgb(0 0 0/.18) 0 1px, transparent 1px 3px)`, static | Token art badges, Hush's visor, boot screen | Under any text |
| **Speed lines** | `repeating-conic-gradient(from 0deg, rgb(252 238 10/.5) 0 2deg, transparent 2deg 9deg)`, radial mask: clear 0–30%, visible 30–70%, fading to 100% | Behind Hush in the Clamp, behind the loot card (bursts, then rests at 25%), behind featured token art (static, 15%) | Behind text; never rotates continuously |
| **HUD hairlines and corner ticks** | 1px `--line` dividers. Corner tick: an L at top-left, 12px arms, 2px `--line`. | Top bar, ticker, tracker, stats rows, proof, all dark panels, demo panel | Paper and bright-fill elements |
| **Stickers** | Bright fill, 2–3px ink outline, black text, tilted between −4° and +4°. Stamps, SFX and the LIVE NOW, YOUR LAUNCH and LAUNCH SET tabs use Dela (`shout-md`). Status chips and trust lines use Chakra 700. | Status chips, trust lines, stamps (LOCKED, COLLECTED, SECRET), SFX, LIVE NOW tab | At most 5 visible per viewport; never on body paragraphs |

Body text always sits on a flat surface (night, panel, raised or paper) with nothing behind it.

---

## 4. Mascot: Hush

Hush is a walking padlock. His head and body are one padlock, the shackle is his "ears", and the visor is where his eyes live. He's original: no game or anime likeness.

**Construction**, SVG `viewBox="0 0 120 140"`. All outlines are `--ink`, 4px, round joins.

| Part | Shape |
|---|---|
| Shackle | `path d="M38 58 V38 a22 22 0 0 1 44 0 V58"`, drawn twice: ink at stroke 16, then `--steel` at stroke 9 (butt caps). Group `#shackle`. **Open:** `translateY(-14px) rotate(-12deg)`, origin `82px 58px`. **Closed:** identity. |
| Body | `rect x=18 y=52 w=84 h=70 rx=18`, fill `--magenta` |
| Cel shade | `rect x=80 y=56 w=18 h=62 rx=10`, fill `--magenta-shade`, clipped to the body |
| Shine | `rect x=28 y=60 w=10 h=18 rx=5`, white at 55% |
| Visor | `rect x=28 y=70 w=64 h=26 rx=13`, fill ink, scanlines inside at 25% |
| Eyes | Inside the visor, centres at (46,83) and (74,83), cyan unless stated |
| Mouth | Neutral is a keyhole: circle r5 at (60,105) plus `M57 108 L63 108 L64 116 L56 116 Z`, ink |
| Arms | Ink stroke 6, round caps. Relaxed: `M18 92 q-12 6 -14 18` and `M102 92 q12 6 14 18`. Hands: circle r5, paper, 3px ink. |
| Legs | `rect 34,120 16×14 rx5` and `70,120 16×14`, fill `--panel` |
| Feet | `rect 30,130 24×9 rx4.5` and `66,130`, fill cyan, 3px ink |

**Sizes:**
- 28px: logo. Head only: shackle, body, visor and eyes, no shine, legs or arms.
- 64px: inline helper.
- 120px: screen hero on phone.
- 160px: Clamp overlay.
- 200px: desktop hero.

**Poses** (every pose is a set of swappable `<g>` groups):

| Pose | Eyes | Mouth | Shackle | Arms and extras | Idle motion (off in calm mode) |
|---|---|---|---|---|---|
| idle | rounded rects 8×12 rx4 | keyhole | closed | relaxed | blink every 4s (eyes `scaleY(.1)` for 120ms), breathe `scaleY 1↔1.02` over 3s |
| excited (live) | chevrons `^ ^`: stroke 4 `M40 86 l6 -6 l6 6` and the same at x+28 | open grin `M48 102 H72 Q72 116 60 116 Q48 116 48 102Z`, ink | closed | both arms up (`M18 88 q-10 -12 -6 -26`, mirrored). Yellow "!" sticker above the head. | hops 8px ×3 on mount, then idle |
| locking | squeezed `> <` strokes | flat `M52 108 H68` | open, then slams closed | arms wrap the front (`M18 92 q20 14 40 10`, mirrored) | the Clamp only |
| waiting | idle rects shifted (+4,−3), looking up-right | small "o" (circle r3) | closed | one arm on hip. Speech bubble "…" whose dots fill in turn every 400ms. | right foot taps ±10° every 300ms |
| win | yellow 4-point stars r7 | open grin | **open** (the lock is loot) | both arms up holding the token coin (circle r12, token colour, 3px ink) | jumps 16px ×2 on mount |
| fair share | left wink arc `M40 84 q6 -6 12 0`, right idle rect | smile `M50 104 Q60 114 70 104` (stroke 4) | closed | right arm thumbs-up. Cyan sweat drop at (98,58). | one nod |
| missed | flat bars 10×3, lowered 3px | wobble `M52 110 q4 -3 8 0 q4 3 8 0` | closed | shrug (both arms out, palms up). Small green money bag by the feet with an ink `$`. | shrug once |
| refund | closed happy arcs `M40 86 q6 -6 12 0` | smile | closed | hugs a green money bag in front of the lower body | bag bounces once |
| error | coral X per eye (two 3.5px strokes) | wobble | askew: `rotate(14deg) translateY(-6px)` | a paper zigzag crack on the visor `M70 72 l4 6 l-3 4 l5 6`, and a coral spark star at the shackle | shakes ±3px twice in 200ms |

Speech bubbles: paper fill, 2px ink, Chakra 600 15px black, tail toward Hush, max-width 220px. Used only on Home, Locked, Unlocking, Ready, Stuck and Not found.

---

## 5. Components

### 5.1 Primary button `.btn-primary` (at most one per screen)

**Anatomy:**
- Yellow fill, 3px ink, `--cut-m`, shadow `--pop`.
- Label in `btn` style, black. Right-aligned chevron icon 16px.
- Full width on phone; min-width 280px on desktop.

**States:**
- **Hover:** `translate(-2px,-2px)`, shadow grows to 6px, the chevron slides 4px right (160ms `--ease-out`). Plays one glitch burst on hover-enter (§6, row 4).
- **Pressed:** `translate(4px,4px)`, shadow 0 (80ms).
- **Focus:** cyan ring, offset 4px.
- **Disabled:** fill `--raised`, 2px dashed `--line` outline, text `--muted`, no shadow. The label says why it's disabled ("Pick your max price").
- **Loading:**
  - Fill stays yellow and the label becomes the progress sentence.
  - A diagonal stripe overlay (`repeating-linear-gradient(-45deg, rgb(0 0 0/.12) 0 10px, transparent 10px 20px)`) slides by one stripe period (28.28px) per 600ms, linear, so the loop is seamless. It's static in calm mode.
  - Set `aria-busy="true"` and ignore clicks.

### 5.2 Secondary button `.btn-2`

- Transparent fill, 2px cyan outline, `--cut-m`, Chakra 700 17px, sentence case, cyan text, min-height 48.
- Hover: cyan fill at 12%. Pressed: `translate(2px,2px)`. Disabled: `--line` outline, muted text.
- Loading: a 12px spinner square rotating every 800ms; three static dots in calm mode.
- **Text link** variant: cyan, 2px underline offset 4px, min-height 44.

### 5.3 Chip / preset `.chip`

- Fill `--raised`, 2px `--line`, `--cut-s`, height 48, padding 0 14px, `num-md` in `--text`.
- Hover: outline turns cyan.
- **Selected:** cyan fill, black text, 3px ink, `--pop-sm`. Pops `scale 1→1.06→1` (`--spring`, 300ms).
- Pressed: `translate(2px,2px)`.
- Disabled: transparent, 2px dashed `--line`, text `--muted`.
- Focus: cyan ring. When the chip is selected, the ring is paper.

### 5.4 Price picker `fieldset#price-picker`

- Legend: "Your max price", plus an info button `{i:info}`.
- Built from `role=radiogroup` and native radios `#price-0` to `#price-N` (`name="price"`), each label styled as a chip. Arrow keys work natively.
- Up to 16 options: wrapping grid, 3 columns on phone and 4 on desktop, gap 8. A chip is about 100px wide; 4 columns at 390px would overflow.
- More than 16 options: one horizontally scrolling row with snap, a 24px edge fade and left/right arrow buttons, plus a field `#price-typed` "Type a price" that snaps to the nearest option on blur.
- Never mark an option as popular.
- Helper below: "You pay the final price, or less. Never more than this."

### 5.5 Amount picker `fieldset#amount-picker`

- Legend: "How much?"
- 4 equal presets: `#amount-100`, `#amount-250`, `#amount-500`, `#amount-max`. Line 1 is the dollars (`num-md`). Line 2 is the tokens (Chakra 600 13px, muted, or black when selected).
- Tokens = `floor(dollars ÷ price ÷ lot) × lot`. MAX = the bid money.
- A preset above the bid money is disabled.
- Field `#bid-tokens` (`inputmode=numeric`, label "Or type tokens", suffix the ticker in muted text). It reformats with separators on blur. Typing clears the preset unless the value matches one.
- Before a price is picked, the presets are disabled and the helper reads "Pick your max price first."
- Over the limit: coral border and "That's more than your $1,000 bid money. At $0.020 the most is 50,000 NCAT."

### 5.6 Receipt slip `.receipt` (the three-line receipt)

**Anatomy:**
- Two elements: `.receipt-wrap` (relative, `filter: drop-shadow(6px 6px 0 var(--magenta))`) around `.receipt` (paper fill, no outline). The mask clips everything on its own element, including filters and anything that overflows, so the shadow and the stamp must live on the wrapper.
- Zigzag bottom edge on `.receipt`: `mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) 50%/20px 100%` (10px-deep teeth).
- A cyan "SECRET" stamp, a child of the wrapper, positioned at the top-right: `shout-md` at 14px, 2px ink, `rotate(6deg)`.

**Lines:** three grid rows, separated by a 2px dashed ink line at 30%. Each row has:
- A 28px icon chip (`--cut-s`, accent fill, 2px ink, black glyph).
- A label (`body-lg` 600, black).
- A value (`num-lg`, black). Only the number uses Oxanium. The unit ("NCAT") and "of $1,000" are Chakra 600 15px suffixes.

Layout: below 640px, `grid-template-columns: 28px 1fr` with the label above the value, both left-aligned. From 640px, one line per row with the value right-aligned. Loot cards use the same rule. Receipt padding: 12px on phone, 20px on desktop.

| Before (bid) | After (result) | Icon chip |
|---|---|---|
| You get up to · **25,000 NCAT** | You got · **25,000 NCAT** | cyan `{i:coin}` |
| You pay at most · **$500.00** | You paid · **$400.00** | yellow `{i:dollar}` |
| Comes back for sure · **$500.00 of $1,000** | Comes back · **$600.00** | green `{i:return}` |

**Footer:** Chakra 500 15px, black. "If the final price is lower, you pay less."

**Empty:** values show "–" and the footer reads "Pick a price and an amount to see your bid."

**On change:** the changed digits roll (§6, row 6) and the slip nudges `translateY(2px→0)` over 120ms.

### 5.7 Countdown `.countdown`

- Dark panel with a corner tick. A `label` style line ("BIDDING CLOSES IN" / "BIDDING OPENS IN"), then `num-xl` digits in the phase colour (yellow live, violet soon). Each digit sits in its own fixed-width span.
- **Under 60 s:** turns coral and the label becomes "LAST MINUTE". Each tick pulses `scale 1→1.05→1` (200ms; none in calm mode). **It never blinks.**
- Use `role="timer"`. An sr-only sentence updates once a minute ("Closes in 14 minutes").

### 5.8 Mission tracker `.tracker`

- 4 chevron segments, 44px tall: `clip-path: polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)`, overlapping by 6px.
- Segment labels and icons: BID IN SECRET `{i:lock}`, UNLOCK `{i:key}`, RESULT `{i:star}`, TRADING `{i:arrow-up-right}`.
- **Done:** `--raised` fill, green check, muted label.
- **Current:** phase-colour fill, black icon and label.
- **Future:** `--panel` fill, muted.
- **Branch (stuck or cancelled):** UNLOCK turns coral `{i:alert}` "STUCK". RESULT turns green `{i:return}` "MONEY BACK". TRADING is muted with a strike-through, "NO TRADING".
- **Phone:** the current segment is `flex:3` and shows its label. The others are `flex:1`, icon only, with `aria-label`.
- **Desktop:** all labels show; the current segment is `flex:1.6`.
- Below it, the **objective line** (`small`, `--text`), one per phase:
  - Starts soon: "Bidding opens soon."
  - Live: "Bid before the timer runs out."
  - Unlocking: "Bids are unlocking. Nothing to do."
  - Ready: "Anyone can reveal the result."
  - Stuck: "Anyone can refund everyone."
  - Done: "Collect your tokens and money."
  - Cancelled: "Collect your money back."

### 5.9 Status chip `.status`

- Sticker: phase fill, 2px ink, black `label` text, 14px icon on the left, height 28, padding 0 10px, `rotate(-3deg)` on cards and 0 in rows.
- Launch phases:

  | Chip | Colour | Icon |
  |---|---|---|
  | STARTS SOON | violet | clock |
  | LIVE | yellow | live dot: a static 8px ink dot plus a ring that grows `scale 1→2.2`, opacity `.8→0`, 1600ms, infinite. No ring in calm mode. |
  | UNLOCKING | cyan | key |
  | READY | magenta | sparkle |
  | STUCK | coral | alert |
  | DONE | green | check |
  | TRADING | green | arrow-up-right |
  | MONEY BACK | green | return (cancelled launches) |

- Your-bid chips: LOCKED (cyan, lock), WON (yellow, star), FAIR SHARE (cyan, half-circle), MISSED (coral, x), COLLECTED (green, check).

### 5.10 Launch card `.launch-card` (home and lists)

- Dark panel, 2px `--line`, `--cut-m`, padding 16, corner tick.
- **Row 1:** token art 56px; name in `h2` at 20px; `$TICKER` in Oxanium 15px muted. The status chip overlaps the top-right edge by 10px.
- **Row 2:** up to 3 stats, each a `label` (muted) above a `num-md` value.
- **Row 3:** a full-width secondary button with the phase action.
- The whole card is clickable through a stretched link on the title. Focus ring on `:focus-within`.
- **Hover:** `translate(-3px,-3px)` and `--pop-md` appears (160ms). The token art wiggles `rotate(-6deg→0)` (`--spring`, 300ms).
- **Featured variant** (home "LIVE NOW"):
  - 120px art on static speed lines, `--cut-l`, `--pop-md` always on.
  - `num-xl` countdown and the primary button.
  - A "LIVE NOW" tab: yellow sticker, `shout-md`, sitting on the top edge.

### 5.11 Loot card `.loot` (result outcome)

**Anatomy:**
- Fill in the outcome colour: WON yellow, FAIR SHARE cyan, MISSED coral, MONEY BACK green.
- 3px ink, `--cut-l`, padding 24.
- Shadow `--pop-lg`: magenta, or cyan on the coral MISSED card.
- The outcome word in `shout-xl`, black, `rotate(-4deg)`, overflowing the top-left edge by 12px. Two-word outcomes break onto two lines ("FAIR / SHARE", "MONEY / BACK"). On phone the size is `clamp(32px, 11vw, 44px)`, because Dela is wide (about 0.85em per letter).
- Hush, 100px, in the outcome pose, overlapping the top-right edge.
- A headline sentence (Chakra 700 20px), then the 3 result rows (receipt layout, black on the fill), then a footnote (`small`).

The yellow **Collect** button sits directly under the card, outside it, so the button stays yellow on every outcome. "▸ Trouble collecting?" appears under the button, only when there are both tokens and money to collect.

**Collected:**
- A green "COLLECTED" stamp (`shout-md`, 3px ink) slaps onto the card at `rotate(-8deg)`.
- The button becomes disabled "Collected" with `{i:check}`.

### 5.12 Progress meter `.meter`

- One bar of 20 parallelogram cells (`skewX(-12deg)`), height 18, gap 3. Each cell is 5%.
- Filled cells use the phase colour (cyan unlocking, green sold). Empty cells are `--raised`. On the magenta creator card, filled cells are black and empty cells are `--magenta-shade`.
- A sentence above, never a percentage alone: "88 of 142 bids unlocked", "82% sold: 824,000 of 1,000,000 GOB".
- A newly filled cell grows `scaleY 0→1` from the bottom (160ms, 30ms stagger).
- `role="progressbar"` with `aria-valuenow` and `aria-valuetext` set to the sentence.

### 5.13 Activity ticker `.ticker`

- 36px tall, `--void`, 1px hairlines top and bottom, sits under the top bar. Shown on Home and launch pages only.
- **Left:** a pause/play button `#ticker-pause` (44×36).
- **Track:** a duplicated list crawling at 40px/s, linear, faded 24px at both edges. Items are Chakra 600 14px with an icon, separated by a 6px cyan diamond.
- Pauses on hover or focus-within.
- **Calm mode and reduced motion:** no crawl. Show only the newest item and cross-fade (200ms) when one arrives.
- **Items** (public events only, never amounts):
  - `{i:lock}` "0x3f8a…c2a1 locked a secret bid on NCAT"
  - `{i:lock}` "0x91c0…77e2 locked a secret bid on NCAT"
  - `{i:key}` "RAMEN: 12 of 30 bids unlocked"
  - `{i:star}` "GOB result is in: $0.010"
  - `{i:clock}` "SNAIL bidding opens in 2h 10m"
  - `{i:sparkle}` "MOTH: all bids unlocked, ready to reveal"
- While NCAT is live, the prototype adds a new "locked a secret bid on NCAT" item every 8s with a random address, and the NCAT bid count rolls up by 1.

### 5.14 Toast `.toast`

- Paper, 3px ink, `--cut-m`, `--pop`, max-width 360.
- A 32px icon chip (accent fill), a title (Chakra 700 17 black), an optional line (Chakra 500 15 black) and a close button (44px).
- **Position:** phone, top-centre 8px under the top bar; desktop, bottom-right 24px. At most 2 stacked.
- Auto-hides after 5s. Errors stay until closed.
- Normal toasts use `aria-live=polite`; errors use `role=alert` and a coral 8px left block with `{i:alert}`.
- Motion: §6, row 11.

### 5.15 Modal `.modal` (Connect)

- Scrim: `--void` at 85% with `backdrop-filter: blur(4px)`.
- Panel: `--panel`, 2px `--line`, `--cut-l`, `--pop-md`, `width: min(440px, 100vw - 32px)`.
- On phone it's a bottom sheet: full width, cut corner at top-right instead, max-height 90vh.
- Focus is trapped. Esc and `#connect-close` close it, and focus returns to the opener.
- Option cards are 88px-tall buttons:
  - Passkey: paper fill, black text, `--pop-md`, plus a cyan sticker "NO APP NEEDED".
  - Wallet: `--raised` fill, 2px `--line`.

### 5.16 Wizard stepper `.stepper`

- 3 nodes, "1 Token", "2 Sale", "3 Trading", joined by 2px connectors.
- Node: 36px, `--cut-s`.
  - Done: green fill, black check. Done nodes are buttons, so you can go back.
  - Current: paper fill, black number, 3px ink. Label `--text` 700.
  - Future: 2px `--line`, muted.
- On advance, the connector fills left to right (`scaleX 0→1`, 300ms), then the next node pops (`--spring`, 480ms).

### 5.17 Collapsibles: proof, all bids, trouble collecting

- Native `<details>`. The summary row is 48px, Chakra 600 15 `--muted`, with `{i:chevron-down}` that rotates 180° on open (200ms). Content fades in and moves up 6px (160ms).
- **"Proof on chain"** `#proof`: rows of label, short mono address and a text link "Open {i:external}". Rows:
  - Launch contract 0x5e1d…9b42
  - Your bid transaction 0x7a3c…e1c4 (only if you bid)
  - Token 0x44ab…0e3c
  - Kuru market 0x2d90…f1a7 (only once trading is live)
- **"See all bids (142)"** `#all-bids`:
  - Phone: two lines per bid, "0x3f8a…c2a1 (you) asked 25,000 at up to $0.020" over "got 25,000, paid $400.00".
  - Desktop: a table with columns Bidder / Asked / Max price / Got / Paid.
  - Your row has a 4px cyan left bar. Shows 10 rows, then "(Show 10 more)".
  - A bid that cheated reads "Cheating bid: money burned". A bid that never unlocked reads "Didn't unlock: full refund".
- **"Trouble collecting?"** `#trouble`: "If one token is paused or blocks your address, collect the other on its own." with buttons (Tokens only) `#collect-tokens` and (Money only) `#collect-money`.

### 5.18 Top bar and bottom nav

**Top bar:** 56px phone, 64px desktop; `--void` at 92% with an 8px backdrop blur; 1px bottom hairline; sticky.
- **Left:** a 28px Hush head and the wordmark "Blindlaunch" (Chakra 700 italic 20px).
- **Desktop centre:** links "Launches", "My bids", "My launches", "How it works" (Chakra 600 16, muted). The active link turns `--text` with a 3px yellow bar, `skewX(-12deg)`, 4px below.
- **Desktop right:** (Create a launch), the calm toggle, the sound toggle, the account chip.
- **Desktop only:** a violet-outline network pill, "Monad testnet", right after the wordmark.
- **Phone right:** calm, sound, account chip.
- **Account chip:**
  - Signed out: (Sign in), 44px.
  - Signed in: `--raised`, 2px `--line`, `--cut-s`, 44 tall, showing a 20px avatar square in the address colour, the balance "$1,240" (Oxanium 16) and a caret.
  - It opens a popover with: "0x3f8a…c2a1" plus (Copy); "Passkey wallet" or "MetaMask"; "USDC balance $1,240.00"; (Get test USDC); (Sign out).

**Bottom nav:** phone under 900px only. Fixed, 64px plus `env(safe-area-inset-bottom)`, `--void`, top hairline.
- Four tabs: Launches `{i:grid}`, My bids `{i:lock}`, Create `{i:plus}`, My launches `{i:flag}`. Each is a 24px icon over a Chakra 600 13px label in sentence case, with no tracking. Uppercase "MY LAUNCHES" would overflow a 97px tab.
- Active: the icon sits in a 40×28 cyan `--cut-s` block with a black icon, and the label is `--text`. Inactive: muted.
- On tap the icon bounces up 4px (`--spring`).
- Content gets `padding-bottom: calc(80px + env(safe-area-inset-bottom))`.

### 5.19 Demo controls `#demo`

- **Tab** `#demo-open`: "DEMO" in a 2px dashed violet outline, `--void` fill, violet `label` text.
  - Phone: bottom-left, 12px above the bottom nav. Desktop: bottom-left 24px.
  - The dashed outline marks it as not part of the product.
- **Panel:** phone, a bottom sheet (max 70vh, scrolls); desktop, 320px wide and anchored bottom-left. Contents in §10.2.

### 5.20 Calm mode and sound toggles

- 44×44 icon buttons with `aria-pressed` and a label tooltip.
- **Calm** `#toggle-calm`:
  - Icon is a wave when motion is on, a flat line when calm.
  - It sets `data-calm="on"` on the root.
  - Its default follows `prefers-reduced-motion`.
  - Toast when turned on: "Calm mode on. No shakes, glitches or confetti."
- **Sound** `#toggle-sound`:
  - Icon is a speaker with waves, or a speaker with an x.
  - Off by default.
  - Toast when turned on: "Sound on."
- Both are saved in `localStorage` as `bl-calm` and `bl-sound`, inside try/catch.

### 5.21 Form field, toggle switch, tooltip, choice card

- **Field:**
  - The label above (`small`, `--text`). The input is 52px tall, `--raised`, 2px `--line`, `--cut-s`. Numbers use Oxanium 20, text uses Chakra 500 18. Prefix and suffix inside, muted.
  - Focus: cyan border and ring.
  - Error: coral border, coral `small` message with `{i:alert}` below, linked by `aria-describedby`. The field shakes once, `translateX 0,-6,6,-4,4,0` over 300ms (off in calm mode).
- **Toggle switch:** 56×32 track (`--raised` off, green on) with a paper square knob, `--cut-s`, 2px ink. The knob slides with `--spring` at 300ms.
- **Tooltip:** a tap-to-toggle `{i:info}` button (never hover-only). Paper, 2px ink, Chakra 500 15 black, max-width 260px.
- **Choice card:** a large radio (88px). Selected: paper fill, black text, `--pop-md`. Unselected: panel with 2px `--line`.

### 5.22 Icons and token art

**Icons:** inline SVG, 24×24, stroke 2.5, square caps, mitre joins, `currentColor`. Only the coin and the bag are filled. The set:
- lock, unlock, key, clock, eye-off, equals, arrow-up-right, shield, check, x, alert (triangle), info, external, chevron-right, chevron-down, plus, flag, grid, wallet, fingerprint, coin, dollar, return (arrow curving back), bag, pause, play, speaker, speaker-off, wave, flat-line, copy, sparkle (4-point star), star.

No emoji anywhere.

**Token art badge:**
- A square, `--cut-s` (56px) or `--cut-m` (120px). Token colour fill, 3px ink, scanlines at 15%.
- A face drawn from simple shapes (§9).

---

## 6. Motion system

Animate only `transform`, `opacity` and `filter`. Exceptions: one-shot `clip-path` wipes (never looped), and the `background-position` of loading stripes.

`[data-calm=on]` and `@media (prefers-reduced-motion: reduce)` behave identically. Both turn off:
- glitch, flicker, shake, confetti
- speed-line bursts, scramble
- the ticker crawl
- idle mascot loops
- the page wipe

They keep:
- colour and state changes
- fades of 200ms or less
- instant number swaps
- focus rings

| # | Name | Duration and easing | Trigger | What moves | Reduced / calm |
|---|---|---|---|---|---|
| 1 | **Boot** | ≤1200ms, then a 300ms wipe | First visit per session, hash empty or `#home` | §6.1 | Skipped |
| 2 | **Page wipe** | 320ms `--ease-swap` | Screen change | View Transition. The new root's `clip-path` goes from `polygon(0 0,0 0,-15% 100%,0 100%)` to `polygon(0 0,115% 0,100% 100%,0 100%)`, the old root fades out in 120ms, and the page scrolls to top. With no View Transitions support: instant swap plus a 160ms fade-in. | 150ms cross-fade |
| 3 | **Hover lift / press sink** | 160ms `--ease-out` / 80ms linear | Hover / `:active` | §5.1–5.3 | Kept (they're state, not decoration) |
| 4 | **Glitch burst** | 220ms, `steps(2)` per 110ms | Primary hover-enter, status chip on phase change, result H1, error toast icon | `::before` and `::after` copies (`content:attr(data-text)`) at 70% opacity, offset ±2px, in cyan and magenta, sliced with `clip-path: inset()` keyframes. Never coral. At least 1s between bursts on the same element. | Off |
| 5 | **Countdown tick** | 220ms `--ease-out` | Each second | Each changed digit: the old one moves up 100% and fades, the new one comes from +100% | Instant swap |
| 6 | **Digit roll** | 220ms | Bid count, unlock count, receipt values | Same as 5, per changed digit | Instant |
| 7 | **Count-up** | 900ms `--ease-out` (rAF) | Loot values, creator raise, stats on the result page | The number goes from 0 to its value, formatted every frame, and ends on the exact value | Final value |
| 8 | **The Clamp** | ~1250ms | Bid sent | §6.2 | §6.2 |
| 9 | **Unlocking** | per event | Unlock count changes | A new cell grows (§5.12). Every 10th unlock, Hush's shackle hops 4px. At 100%: one light band (30% white gradient) sweeps across the meter left to right in 500ms, then Stage clear. | Cells fill instantly. No sweep. |
| 10 | **Stage clear** | 300ms + 480ms | Phase advance | The finished tracker segment fills with a diagonal `clip-path` wipe (left to right, 300ms). The next segment pops `scale 1→1.08→1` (`--spring`). Toast "STAGE CLEAR" (§8 copy). The status chip slaps (row 12). | Colour change and toast only |
| 11 | **Toast in / out** | 480ms `--spring` / 160ms | Any toast | In: `translateX(24px) rotate(2deg)`, opacity 0, to rest. Out: fades and moves up 8px. | 150ms fade |
| 12 | **Sticker slap** | 350ms `--spring` | Stamps, chips on change, SFX | `scale 1.6→1`, `rotate(+8deg)` to its final tilt. Opacity 0→1 in the first 60ms. | 150ms fade |
| 13 | **Decode reveal** | 1100ms | Result page entry after "Reveal the result" | §6.3 | Price shown at once |
| 14 | **Loot drop** | 480ms + extras | After the decode | §6.4 | 200ms fade, no extras |
| 15 | **Confetti** | ~2s | WON and FAIR SHARE loot landing only, once per page view | §6.4 | Off (`disableForReducedMotion:true` and the calm check) |
| 16 | **Idle mascot** | blink every 4s, breathe 3s | Hush visible | §4 | Static. Paused while the tab is hidden. |
| 17 | **Live dot** | 1600ms, infinite | LIVE chip | Ring only | Static dot |
| 18 | **Ticker crawl** | 40px/s linear | Always | §5.13 | Static, newest item |

### 6.1 Boot (runs once, skippable, readable by 1.5s)

The boot overlay is in the HTML before the content. An inline script placed right after it removes it synchronously if any of these are true:
- the hash is neither empty nor `#home`
- `sessionStorage['bl-booted']` is set
- calm mode is on, or reduced motion is set

The overlay also removes itself with CSS (`animation: boot-out 300ms 1200ms forwards`, ending at `visibility:hidden`), so it never traps anyone, even without JS. The content behind it is fully rendered from the start.

| Time (ms) | Event |
|---|---|
| 0 | `--void` screen with grain and scanlines. A 120px Hush head pops from `scale 0` (`--spring` 480ms), shackle open. |
| 200 | Typed line 1 (Oxanium 16, chars appear over 180ms with `steps`): `> SECRET BIDS ......... ON` (ON in green) |
| 420 | `> ONE PRICE FOR ALL ... ON` |
| 640 | `> SNIPERS ............. OFF` (OFF in coral, static) |
| 860 | The shackle clamps shut (`--spring` 350ms) |
| 1200 | The overlay exits with a diagonal wipe toward the top-right (300ms `--ease-in`). Done by 1500. |

A (Skip) button `#boot-skip` sits top-right (44px). Any key or tap also skips, with a 120ms fade. Afterwards, set `sessionStorage['bl-booted']=1` inside try/catch.

### 6.2 The Clamp (signature)

Before the Clamp, the button shows these loading labels: "Locking it on your device…" (600ms), then "Confirm with Face ID…" (passkey) or "Confirm in your wallet…" (wallet) (800ms), then "Sending…" (500ms).

| Time (ms) | Event |
|---|---|
| 0 | The overlay (z 70) fades in to `--void` at 88% over 160ms, with a halftone field. Hush appears at 160px in the screen centre, `scale .6→1` (`--spring` 480ms), shackle open, locking pose. |
| 120 | A fixed-position clone of the receipt slip flies to Hush's body centre: translate, then `scale(.15) rotate(8deg)`, 420ms `--ease-swap`. Three afterimages follow the same path 30, 60 and 90ms later: solid slip-sized cut shapes in cyan at 60%, magenta at 40% and yellow at 20%. Each fades out on arrival. |
| 540 | The slip vanishes (60ms). Hush squashes to `scaleX 1.1 scaleY .88` (60ms), then springs back (`--spring` 350ms). |
| 560 | The shackle slams from `translateY(-14px)` to 0 in 90ms `--ease-in`, then settles with `--spring` 350ms. The eyes become `> <`. |
| 650 | A "KA-CHUNK" sticker appears at Hush's upper right: `shout-md` at 40px, yellow, 3px ink, `rotate(-10deg)`, sticker slap. A speed-line ring grows `scale .5→1.2` while opacity goes `.9→0` (450ms). The screen wrapper shakes through `(4,-2)`, `(-3,2)`, `(2,-1)`, `(0,0)` in 180ms. |
| 850 | The eyes become `^ ^`. A "LOCKED" stamp (cyan, 3px ink, `shout-md`) slaps onto Hush's body. |
| 1250 | Navigate to `#locked` with the page wipe. The overlay fades out over 200ms. Toast: "Bid locked. Nobody can see it. Not even us." |

**Reduced / calm:** the overlay fades in with Hush already closed and the LOCKED stamp showing, holds for 600ms, then navigates. No flight, shake, ring or SFX sticker.

### 6.3 Decode reveal (final price)

The visible price span is `aria-hidden`. An sr-only `aria-live=polite` node gets "Final price: $0.016" at 0ms.

| Time (ms) | Event |
|---|---|
| 0 | The "FINAL PRICE" label shows. The price shows a fixed "$" and ".", and the other slots cycle through `0123456789#%&` every 70ms, all in `--muted`. Same colour and same weight, so it's text changing, not a luminance flash. |
| 400 | Slots lock left to right, one every 110ms. Each locks into yellow with a `scale 1.25→1` pop (180ms `--spring`). |
| 900 | The glow fades in over 300ms. One speed-line ring bursts behind the price (500ms). |
| 1000 | "Everyone pays this." slides up 8px and fades in (200ms). |
| 1100 | The loot drop starts. |

### 6.4 Loot drop per outcome

**Common to every outcome:**
- The card goes from `translateY(-40px) scale(.85) rotate(-3deg)`, opacity 0, to rest (`--spring` 480ms).
- The halftone and speed lines behind it go from opacity 0 to .6, then rest at .25 (600ms).
- The outcome word slaps in 150ms later.
- Hush pops from `scale 0` 200ms later.
- The values count up from 250ms after landing.

| Outcome | Extras |
|---|---|
| WON | Confetti: two bursts from the bottom corners, 60 particles each, `spread 70`, `startVelocity 55`, `gravity 1.1`, `ticks 200`, colours `#FCEE0A #00F0FF #FF2A6D #05FFA1 #F6F1E1`, shapes square and circle. Hush jumps twice. |
| FAIR SHARE | Small confetti: 40 particles from the centre, cyan and yellow only. "62%" in the headline counts up from 0. |
| MISSED | `--spring-soft` (no overshoot), no speed lines, no confetti. After landing, a 3px green underline draws under "Comes back $1,000.00" (left to right, 400ms). |
| MONEY BACK | `--spring-soft`, no confetti. The money bag bounces once. |

Confetti never fires on MISSED, MONEY BACK, Create success or anything else.

### 6.5 Hard limits

- Nothing flashes more than 3 times in any second. No full-screen flashes; the Clamp and the reveal use motion, never a colour flash.
- Coral and anything red never flash, blink or pulse in opacity.
- No neon flicker or "ignite" effects anywhere.
- No looping glitch. Never glitch body text. Glitched elements keep their real DOM text.
- No scroll-triggered reveals. Entrance animations run only on state changes the user caused.

---

## 7. Sound (off by default)

Build with one hand-written WebAudio helper (oscillator plus gain envelope, about 30 lines, master gain .12). No library. Sound plays only after the user turns it on (a gesture). Calm mode doesn't mute it.

| Event | Sound |
|---|---|
| Chip or preset select | 40ms square blip, 880Hz |
| Price picked and receipt complete | two-note blip, 660 then 990Hz |
| Clamp impact | "ka-chunk": an 80ms noise burst through a 400Hz lowpass, plus a 110Hz square for 90ms |
| Bid locked | rising triangle arpeggio C5 E5 G5, 70ms each |
| Stage clear | two quick notes and a high sparkle (2kHz, 30ms) |
| Decode slot lock | 10ms tick at 1200Hz per slot |
| WON | 5-note triangle fanfare, 500ms |
| FAIR SHARE | 3-note version of the fanfare |
| MISSED / MONEY BACK | two soft falling notes, then a coin "ching" (money still comes back) |
| Collect | coin cascade: 4 blips from 1300 to 1800Hz |
| Error | two low 180Hz square blips |

---

## 8. Screens

Every screen uses the top bar and, on phone, the bottom nav. The ticker shows on Home and launch pages only. Desktop notes describe the 1366px layout.

### 8.1 Home `#home`

```
┌────────────────────────────────────────┐
│@head Blindlaunch   {i:wave}{i:spk}(Sign in)
├────────────────────────────────────────┤
│{i:pause} {i:lock} 0x3f8a…c2a1 locked a se│ ticker
├────────────────────────────────────────┤
│ <ON MONAD>                    @excited │
│ Secret bids.                    96px   │
│ One price.                   (halftone)│
│ No snipers.                            │
│ Bid once, in secret. When bidding      │
│ ends, every winner pays the same       │
│ price, and trading opens at it.        │
│ <{i:eye-off} Nobody sees your bid>     │
│ <{i:equals} One price for everyone>    │
│ <{i:arrow-up-right} Trading opens at   │
│  that price>                           │
│ <{i:shield} Full refund if anything    │
│  breaks>                               │
│                                        │
│ ┌<LIVE NOW>────────────────────────┐   │
│ │[art 120]  NEONCAT        <LIVE>  │   │
│ │ speedlns  $NCAT                  │   │
│ │ BIDDING CLOSES IN                │   │
│ │ 14:32                            │   │
│ │ STARTS AT  SECRET BIDS  FOR SALE │   │
│ │ $0.010     142          3,000,000│   │
│ │ ((BID ON NCAT                 ▸))│   │
│ └──────────────────────────────────┘◣  │
│ Starting soon                          │
│ ┌[art] TURBO SNAIL   <STARTS SOON>─┐   │
│ │ OPENS IN 2:10:44  STARTS AT $0.005│  │
│ │ (See launch)                      │  │
│ └───────────────────────────────────┘  │
│ Waiting for the result                 │
│  [RAMEN RAT  <UNLOCKING> UNLOCKED 12 of 30 (Watch it unlock)]
│  [MOTH MOTOR <READY> UNLOCKED 57 of 57 (Reveal the result)]
│  [CHROME FROG <STUCK> BIDS 30 (Refund everyone)]
│ Finished                               │
│  [GLITCH GOBLIN <DONE> FINAL PRICE $0.010 SOLD 82% (See result)]
│ How it works                           │
│ ╔1 Bid in secret═════════════════════╗ │
│ ║ @locking  Pick a price and amount. ║ │
│ ║           It locks on your device. ║ │
│ ╚════════════════════════════════════╝ │
│ ╔2 Bids unlock together ... 3 ... 4══╗ │
│ (More on how it works)                 │
│ Monad testnet. Not audited. Use test   │
│ money only. Prices can move fast once  │
│ trading starts.                        │
├────────────────────────────────────────┤
│ {i:grid}   {i:lock}   {i:plus}  {i:flag}│
│ LAUNCHES   MY BIDS    CREATE  MY LAUNCHES
└────────────────────────────────────────┘
```

- **Hero:** <ON MONAD> is a magenta sticker in Chakra 700 `label` style, `rotate(-4deg)`. Speech bubble: "Bots can't snipe what they can't see."
- **Trust stickers** alternate tilts −2°, 1.5°, −1°, 2°. Fills: cyan, yellow, green, magenta. They aren't buttons.
- **Comic panels** (paper, 3px ink, `--pop-md`, tilts alternate ±1°, the number in a 28px ink circle with paper text). On phone each panel is a full-width row: 120px drawing on the left, text on the right. Title in Chakra 700 18, line in Chakra 500 15.
  1. "Bid in secret": "Pick a price and an amount. It locks on your device." Drawing: Hush slamming his shackle onto a slip.
  2. "Bids unlock together": "When bidding ends, every bid unlocks at once. No peeking before." Drawing: five small padlocks popping open around a clock at 0:00.
  3. "Everyone pays one price": "The final price is where the tokens sell out. Bid higher, still pay that." Drawing: three bidder blobs (cyan, violet, green) each holding a "$0.016" tag.
  4. "Trading starts on Kuru": "Trading opens at the final price. Unused bid money comes back." Drawing: coins arcing from a green market stall back to the blobs.
- **Empty states:**
  - Nothing live: "Nothing live right now." / "The next launch opens in 2h 10m." / ((SEE WHAT'S NEXT)), which scrolls to Starting soon.
  - No launches at all: "No launches yet." / ((CREATE A LAUNCH)).
- **Desktop:**
  - The hero is two columns: headline, sub and stickers on the left (7/12); the featured card on the right (5/12), with Hush (200px) peeking over its top edge.
  - Section cards sit in a 3-column grid.
  - Comic panels are 4 across, each with the drawing above the text.

### 8.2 Launch page, live `#launch-live` (signed in, enough USDC)

```
┌────────────────────────────────────────┐
│ top bar · ticker                       │
│ (‹ Launches)                           │
│ [art72] NEONCAT                 <LIVE> │
│         $NCAT                          │
│ ┌BIDDING CLOSES IN─────────────────┐   │
│ │              14:32               │   │
│ └──────────────────────────────────┘   │
│ [{i:lock} BID IN SECRET ▶]{key}{star}{↗}│
│ Bid before the timer runs out.         │
│ SECRET BIDS 142   FOR SALE 3,000,000   │
│ STARTS AT $0.010  BID MONEY $1,000 {i} │
│ ┌Your secret bid─────────────────────┐ │
│ │ 1  Your max price {i:info}   @64px │ │
│ │ [ $0.010 ] [ $0.012 ] [ $0.014 ]   │ │
│ │ [ $0.016 ] [ $0.018 ] [*$0.020*]   │ │
│ │ [ $0.022 ] [ $0.024 ] [ $0.026 ]   │ │
│ │ [ $0.028 ] [ $0.030 ] [ $0.032 ]   │ │
│ │ You pay the final price, or less.  │ │
│ │ Never more than this.              │ │
│ │ 2  How much?                       │ │
│ │ [$100 ][$250  ][$500  ][MAX   ]    │ │
│ │ [5,000][12,500][25,000][50,000]    │ │
│ │ Or type tokens [25,000      NCAT]  │ │
│ │ ╔═════════════════════<SECRET>═══╗ │ │
│ │ ║{coin} You get up to            ║ │ │
│ │ ║       25,000 NCAT              ║ │ │
│ │ ║{$}    You pay at most          ║ │ │
│ │ ║       $500.00                  ║ │ │
│ │ ║{ret}  Comes back for sure      ║ │ │
│ │ ║       $500.00 of $1,000        ║ │ │
│ │ ║ If the final price is lower,   ║ │ │
│ │ ║ you pay less.                  ║ │ │
│ │ ╚/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\╝ │ │
│ │ One bid per wallet. You can't      │ │
│ │ change it after.                   │ │
│ │ ((LOCK IN MY BID              ▸))  │ │
│ │ Locks $1,000 USDC until the result.│ │
│ │ What you don't spend comes back.   │ │
│ └────────────────────────────────────┘ │
│ ▸ Proof on chain                       │
└────────────────────────────────────────┘
```

- **Info tooltips:**
  - Max price: "The most you'd pay per token. You may pay less, never more."
  - Bid money: "Everyone locks $1,000 while bidding, so nobody can guess your size. What you don't spend comes back."
- **Hush (64px, top-right of the panel):** excited. Once the receipt is complete he looks at it, and his bubble (desktop only) reads "Looks good. Lock it in."
- **Button label by state:**
  - No price: "PICK YOUR MAX PRICE" (disabled)
  - Price but no amount: "PICK HOW MUCH" (disabled)
  - Over the limit: "TOO MANY TOKENS FOR $1,000" (disabled)
  - Ready: "LOCK IN MY BID"
  - Loading: §6.2
- **Errors** (toast, with the button back to ready):
  - "You cancelled the request in your wallet."
  - "Not enough MON to pay the network fee."
  - "Too late: bidding has closed."
  - "Every bid slot is taken."
- **Desktop:** 12-column grid. The left 7 columns hold the header, countdown, tracker, stats and proof. The right 5 columns hold the bid panel (about 440px inside), sticky at `top: 96px`, with the 4 presets in one row and the price grid at 4 columns.
- `[*$0.020*]` in the wireframe marks the selected chip (cyan).

**State variants** (only the bid panel changes; everything else stays the same):

```
STARTS SOON  #launch-soon            ALREADY BID  #launch-bid
┌BIDDING OPENS IN (violet)─┐         ┌Your bid is locked (cyan border)──┐
│        04:59             │         │ @idle(shackle shut) <LOCKED>     │
└──────────────────────────┘         │ Nobody can see it until bidding  │
┌──────────────────────────┐         │ ends. Not even us.               │
│ @idle                    │         │ You can leave. Nothing else to do│
│ Bidding hasn't started   │         │ (See what I bid)  ← passkey only │
│ Have $1,000 USDC ready.  │         │ One bid per wallet. Yours is in. │
│ You'll pick a price and  │         └──────────────────────────────────┘
│ an amount, then lock it. │
│ (Back to launches)       │
└──────────────────────────┘

NOT SIGNED IN  #launch-guest          NOT ENOUGH USDC  #launch-broke
form fully usable, receipt live       form fully usable, receipt live
((SIGN IN TO BID          ▸))         ┌{i:alert} coral 2px outline──────┐
Use Face ID or a wallet. No           │ You need $1,000 USDC to bid.    │
wallet app needed with Face ID.       │ You have $240.00.               │
→ opens Connect, then returns         └─────────────────────────────────┘
  here with the form kept             ((GET TEST USDC            ▸))
                                      Free test money for Monad testnet.
```

- **"See what I bid"** expands to: "You asked for 25,000 NCAT at up to $0.020. Only your passkey can open this note."
- **Get test USDC:** loading "Sending test USDC…" (900ms). Toast: "Got 1,000 test USDC." The balance becomes $1,240 and the button becomes LOCK IN MY BID.
- **Creator viewing their own live launch:** the panel reads "You made this launch, so you can't bid in it."
- **Starts soon with a low balance:** ((GET TEST USDC)) replaces (Back to launches).

### 8.3 Bid locked `#locked`

```
┌────────────────────────────────────────┐
│        speedlines + @idle(shut)        │
│              <LOCKED>                  │
│   "Locked tight. Even I can't peek."   │
│ Bid locked.                            │
│ Nobody can see it. Not even us.        │
│ ╔Your bid══════════════════<SECRET>══╗ │
│ ║{coin} You get up to / 25,000 NCAT  ║ │
│ ║{$}    You pay at most / $500.00    ║ │
│ ║{ret}  Comes back for sure /        ║ │
│ ║       $500.00 of $1,000            ║ │
│ ╚/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\╝ │
│ ("/" = line break: label over value)   │
│ What happens next                      │
│ [1] Bidding closes in 14:02            │
│ [2] Bids unlock by themselves          │
│ [3] Come back to collect               │
│ ┌{i:check} You can leave. There's    ┐ │
│ │ nothing else to do.                │ │
│ └────────────────────────────────────┘ │
│ (See what I bid)  (See other launches) │
│ TIP  Everyone locks the same $1,000,   │
│ so nobody can guess your size.         │
│ ┌ ─ ─ DEMO: Skip to bidding close ─ ┐  │
│ ▸ Proof on chain                       │
└────────────────────────────────────────┘
```

- No primary button: there's nothing left to do.
- The demo pill `#demo-skip-inline` uses a violet dashed outline.
- **Rotating tips** (one at a time, 6s each, 200ms cross-fade; static in calm mode):
  1. "You never pay more than your max price."
  2. "Everyone locks the same bid money, so nobody can guess your size."
  3. "Bid high or bid right at the line: every winner pays the same final price."
  4. "If the bids can't unlock, everyone gets every cent back."
  5. "Trading on Kuru opens at the final price. No dump at listing."
  6. "Bots can't snipe what they can't see."
- **Desktop:** a centred 720px column. Hush (200px) sits on the left of the headline; the receipt and next steps are side by side.

### 8.4 Unlocking `#unlocking`, Ready `#ready`, Stuck `#stuck`

Same header, tracker and stats as §8.2. The body is replaced by:

```
UNLOCKING                        READY                         STUCK
<UNLOCKING>                      <READY>                       <STUCK>
@waiting "Unlocking. Nothing     @excited "Somebody press      @error "Keys didn't show.
for you to do."                  the button!"                  Everyone gets refunded."
Bids are unlocking               All bids are unlocked         The unlock keys never came
Bidding is closed. Every bid     One tap reveals the final     The bids can't unlock in time.
unlocks by itself. You don't     price for everyone. Anyone    Anyone can call this launch
need to do anything.             can press it.                 off, and everyone gets every
88 of 142 bids unlocked          142 of 142 bids unlocked      cent back.
▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░             ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓          0 of 142 bids unlocked
{i:lock} Your bid: still locked  {i:check} Your bid: unlocked  ░░░░░░░░░░░░░░░░░░░░
((UNLOCK THE REST        ▸))     ((REVEAL THE RESULT      ▸))  ((REFUND EVERYONE        ▸))
Anyone can press this to speed   Costs a tiny network fee.     Your $1,000 comes back. So
it up. Costs a tiny network fee. Then everyone can collect.    does everyone else's.
TIP (rotating)                   TIP (rotating)
```

- **Loading labels:** "Unlocking…", "Revealing…", "Calling it off…" (900ms each).
- **Unlocking finished:** Stage clear (§6, row 10), toast "STAGE CLEAR" / "All bids unlocked." The screen becomes Ready in place (`history.replaceState` to `#ready`).
- **Reveal:** navigate to the chosen outcome, with the decode.
- **Refund everyone:** go to `#refunded`. Toast: "Called off." / "Everyone can collect their money back."
- When you open a launch you didn't bid on, the "Your bid" line is hidden.
- **Desktop:** the same 7/5 split as §8.2. The right column holds the message, meter and button.

### 8.5 Result `#won` `#fair-share` `#missed` `#refunded`

```
┌────────────────────────────────────────┐
│ (‹ Launches)  [art48] NEONCAT $NCAT <DONE>
│ [✓][✓][{i:star} RESULT ▶][↗]           │
│ Collect your tokens and money.         │
│            FINAL PRICE                 │
│             $0.016   (decode, glow)    │
│          Everyone pays this.           │
│ <WON>┌───────────────────────@win─┐    │
│      │ You got all 25,000 NCAT at │    │
│      │ $0.016 each.               │    │
│      │ {coin} You got / 25,000 NCAT│   │
│      │ {$}  You paid / $400.00    │    │
│      │ {ret} Comes back / $600.00 │    │
│      │ Your max was $0.020. You   │    │
│      │ paid less: $0.016 a token. │    │
│      └────────────────────────────┘◣   │
│ ((COLLECT                     ▸))      │
│ ▸ Trouble collecting?                  │
│ SOLD 3,000,000 NCAT <SOLD OUT> BIDS 142│
│ ┌Kuru──────────────────────────────┐   │
│ │ {i:arrow-up-right} Trading is live│  │
│ │ on Kuru at $0.016                │   │
│ │ Locked until 20 Oct 2026.        │   │
│ │ (Open on Kuru {i:external})      │   │
│ └──────────────────────────────────┘   │
│ ▸ See all bids (142)                   │
│ ▸ Proof on chain                       │
└────────────────────────────────────────┘
```

| | WON | FAIR SHARE | MISSED | MONEY BACK (`#refunded`) |
|---|---|---|---|---|
| Final price | $0.016 | $0.020 | $0.022 | no price hero. H1 "Called off", sub "The unlock keys never came, so nobody pays anything." |
| Headline | "You got all 25,000 NCAT at $0.016 each." | "Crowded! You got 62% of what you asked for." | "The final price, $0.022, was above your $0.020 max." | "Every cent comes back." |
| You got | 25,000 NCAT | 15,500 NCAT (of 25,000) | 0 NCAT | 0 NCAT |
| You paid | $400.00 | $310.00 | $0.00 | $0.00 |
| Comes back | $600.00 | $690.00 | $1,000.00 | $1,000.00 |
| Footnote | "Your max was $0.020. You paid less: $0.016 a token." | "Lots of bids landed exactly on $0.020, so each got the same 62%." | "All your money comes back. You can still buy NCAT on Kuru." | – |
| Trouble collecting? | yes | yes | no | no |
| Kuru card | live at $0.016 | live at $0.020 | live at $0.022, plus "Missed out? You can buy NCAT there." | none |
| Tracker | RESULT current | RESULT current | RESULT current | branch: STUCK, MONEY BACK, NO TRADING |
| Collected toast | "Collected." / "25,000 NCAT and $600.00 are in your wallet." | "… 15,500 NCAT and $690.00 …" | "Collected." / "$1,000.00 is back in your wallet." | same as MISSED |

- **Collect:** loading "Collecting…" (900ms), then the collected state (§5.11).
- **Collect error toast:** "A token transfer failed. The token may be paused. Try Tokens only or Money only."
- **Kuru start body for NCAT:**
  - WON: "300,000 NCAT and $9,600.00 are set aside to open trading at $0.016."
  - FAIR SHARE: "… $12,000.00 … at $0.020."
  - MISSED: "… $13,200.00 … at $0.022."
  - Each ends with "Anyone can press this."
- **Desktop:** the price hero is centred, full width. Below it, two columns: the loot card, Collect and Trouble collecting on the left (6/12); stats, Kuru, all bids and proof on the right.

### 8.6 Creator view `#creator` (GLITCH GOBLIN) and the Kuru card states

```
┌────────────────────────────────────────┐
│ (‹ My launches) [art] GLITCH GOBLIN $GOB <DONE>
│ <YOUR LAUNCH>        FINAL PRICE  $0.010│
│ Not every token sold, so everyone paid │
│ the starting price.                    │
│ ┌magenta card, cyan pop shadow─────────┐│
│ │ You raised $8,240.00                 ││
│ │ 82% sold: 824,000 of 1,000,000 GOB   ││
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░ (black cells)   ││
│ │ Your money               $6,592.00   ││
│ │ Unsold tokens          176,000 GOB   ││
│ │ For Kuru     $1,648.00 + 100,000 GOB ││
│ └──────────────────────────────────────┘│
│ ((COLLECT YOUR MONEY AND UNSOLD        │
│   TOKENS                         ▸))   │
│ ▸ Trouble collecting? (Money only) (Unsold tokens only)
│ Kuru card (state below)                │
│ ▸ See all bids (64)  ▸ Proof on chain  │
└────────────────────────────────────────┘
```

Collected toast: "Collected." / "$6,592.00 and 176,000 GOB are in your wallet."

**Kuru card:** a dark panel with a corner tick. Its buttons are always secondary.

| State (hash) | Title | Body | Button → toast |
|---|---|---|---|
| Start `#creator` | Start trading on Kuru | "100,000 GOB and $1,648.00 are set aside to open trading at $0.010. Anyone can press this." | (Start trading on Kuru) `#kuru-start`, "Starting trading…" → "Trading is live on Kuru at $0.010." |
| Live `#creator-trading` | Trading is live on Kuru at $0.010 | "Locked until 18 Oct 2026. Then it can be unwound." | (Open on Kuru {i:external}) |
| Lock over, opened `#creator-unwind` | The 7-day lock is over | "Close the Kuru market and get back what's left in it." | (Unwind the market) `#kuru-unwind`, "Unwinding…" → "Market unwound." / "What was left is in your wallet." |
| Lock over, never opened `#creator-return` | Trading never started | "The lock is over. Take back the 100,000 GOB and $1,648.00 set aside for Kuru." | (Return the reserved tokens) `#kuru-return`, "Returning…" → "Returned." / "100,000 GOB and $1,648.00 are back in your wallet." |

The buyer pages use the same card in its Start and Live states, with the NCAT bodies from §8.5.

### 8.7 Create a launch `#create-1` `#create-2` `#create-3` `#created`

```
#create-1                                #create-2
[1 Token]──[2 Sale]──[3 Trading]         [✓]──[2 Sale]──[3]
Launch a token                           The sale
Three steps. Bidding opens when you say. Tokens for sale [100,000       COO]
Which token?                               You have 1,000,000 COO.
[{i:plus} Make a new token          ]    Lowest price  [$ 0.010 ]
  We create it and send it to you.         Bidding starts here. If not every
[{i:wallet} Use a token I have      ]      token sells, this is the final price.
  Paste its address.                     Highest price [$ 0.050 ]
Name          [Pixel Pigeon       ]      Price options [−] 11 [+]
Ticker        [COO                ]        $0.010 $0.014 $0.018 … $0.050
  2 to 8 letters or numbers.               Bidders pick one of these.
Total supply  [1,000,000          ]      Bid money per bidder
  All of it goes to your wallet.           [$100][$250][$500][$1,000] [$ 500 ]
┌Your launch (live preview)────────┐       Everyone locks this much.
│ [art] PIXEL PIGEON  $COO         │     Bidding lasts [15 min][30 min][1 hour][1 day]
│ 1,000,000 COO made               │     Bidding opens [In 5 min][In 1 hour][Tomorrow]
└──────────────────────────────────┘     ▸ Advanced settings
((NEXT: THE SALE               ▸))       ┌Your launch──────────────────────────┐
                                         │ 100,000 COO, $0.010 to $0.050,      │
                                         │ bidding 30 min, bid money $500      │
                                         │ If every token sells at $0.050, you │
                                         │ raise $5,000.00.                    │
                                         └─────────────────────────────────────┘
                                         ((NEXT: TRADING  ▸))   (Back)

#create-3                                #created
[✓]──[✓]──[3 Trading]                    speedlines + @excited  <LAUNCH SET>
Trading on Kuru                          Your launch is set
[on] Start trading on Kuru after the     Pixel Pigeon (COO) opens for bids in
     sale                                4:59 and runs for 30 minutes.
Trading opens at the final price, so     [preview card]
nobody buys the top and dumps at         Launch link [ …/#launch-soon.coo ] (Copy link)
listing.                                 ((SEE MY LAUNCH                ▸))
List tokens     [10,000      COO]
  10% of the sale.
Add money raised [20 %]
Locked for       [7 days]
  You can't pull the market out until
  the lock ends.
You send 110,000 COO now: 100,000 for
sale and 10,000 for Kuru.
[preview card + "Trading on Kuru at the final price with 10,000 COO
 and 20% of the money, locked 7 days."]
((CREATE LAUNCH                ▸))
Three wallet steps: make the token, approve it, create the launch.
If you stop halfway, press again to pick up where you left off.
```

- **Step 1, existing-token mode:** one field, "Token address" `#create-address`, placeholder "0x…".
  - Found: "Found Glitch Goblin (GOB). You hold 2,000,000 GOB."
  - Not a token: "That address isn't a token. Check it and paste again."
  - The helper becomes "Two wallet steps: approve the tokens, then create the launch."
- **Step 1 errors:**
  - "Give your token a name."
  - "Use 2 to 8 letters or numbers."
  - "Enter how many tokens to make."
- **Step 2 errors:**
  - "You only have 1,000,000 COO."
  - "Must be above the lowest price."
  - "Pick 2 to 64 options."
  - "Bid money must cover at least 1 token at the lowest price."
- **Advanced settings** (collapsed):
  - "Most bids allowed": 65,535
  - "Refund deadline": "If bids can't unlock within 60 min of closing, anyone can refund everyone."
  - "Paid in": USDC
  - "Lot size": 1 token
- **Step 3 with Kuru off:** "No market. The launch ends when everyone collects."
- **Create launch loading labels:** "Step 1 of 3: making your token…", "Step 2 of 3: approving 110,000 COO…", "Step 3 of 3: creating the launch…" (700ms each).
- **After success:** add PIXEL PIGEON to My launches as STARTS SOON. Copy link toast: "Link copied."
- **Defaults:** the empty wizard shows placeholders; the demo control "Fill example" fills the values shown. Price options default to 11, bid money to $500, bidding to 30 min, start to "In 5 min".
- **Desktop:** the form takes the left 7 columns. The preview card sits on the right, sticky, and keeps Hush (120px) beside it.

### 8.8 My bids `#my-bids` and My launches `#my-launches`

```
My bids                                  My launches
┌[art] NEONCAT  <LOCKED>──────────┐      ((CREATE A LAUNCH            ▸))
│ Closes in 14:02  (See launch)   │      ┌[art] GLITCH GOBLIN <DONE>──────┐
└─────────────────────────────────┘      │ Raised $8,240.00. Ready to     │
┌[art] RAMEN RAT <UNLOCKING>──────┐      │ collect.            (Collect)  │
│ 12 of 30 unlocked (Watch it unlock)      └────────────────────────────────┘
┌[art] MOTH MOTOR <READY>─────────┐      ┌[art] PIXEL PIGEON <STARTS SOON>┐ (after create)
│ Ready to reveal (Reveal the result)    │ Opens in 4:59   (See launch)   │
┌[art] CHROME FROG <STUCK>────────┐      └────────────────────────────────┘
│ Keys never came (Refund everyone)
```

- **NEONCAT row:** appears only after a bid. After the result it shows <WON>, "25,000 NCAT and $600.00 to collect" and (Collect). After collecting it shows <COLLECTED> and no button.
- **Row buttons** are always secondary and go to that launch's screen.
- **Empty states:**
  - My bids: "No bids yet." / "Your secret bids show up here." / ((SEE LIVE LAUNCHES)).
  - My launches: "You haven't launched anything yet." / ((CREATE A LAUNCH)).
- **Signed out:** "Sign in to see your bids." / ((SIGN IN)).
- **Desktop:** an 880px centred list. Rows are a single line: art, name, chip, line, button on the right.

### 8.9 Connect modal `#connect`

```
┌────────────────────────────────────────┐
│ @idle48  Sign in to bid            (x) │
│ ╔{i:fingerprint} Use a passkey ═<NO APP NEEDED>╗
│ ║ Face ID or fingerprint. No wallet   ║│
│ ║ app needed.                         ║│
│ ╚═════════════════════════════════════╝│
│ [{i:wallet} Use a wallet               ]│
│   MetaMask, Rabby and others.          │
│ Blindlaunch never sees your keys.      │
└────────────────────────────────────────┘
```

- **Title:** "Sign in to bid" when opened from a bid; "Sign in" from the top bar.
- **Passkey progress** (typed boot lines, Oxanium 15, replace the options):
  - `> Waiting for Face ID…` (900ms)
  - `> Making your wallet… done` (500ms)
  - Then it closes. Toast: "Signed in." / "Wallet 0x3f8a…c2a1."
- **Wallet:** `> Waiting for your wallet…`, same ending.
- **Errors** (shown inline in coral above the options; Hush switches to error):
  - "You cancelled the request in your wallet."
  - "No wallet found in this browser. Use a passkey, or install a wallet like MetaMask or Rabby."
  - "This browser can't use passkeys. Use a wallet instead."

### 8.10 How it works `#how`

- H1 "How it works", sub "Four panels. Thirty seconds."
- The 4 comic panels from §8.1, larger: full width on phone with a 200px drawing above the text; 2×2 at a max of 1000px on desktop.
- Then "The fine print, in plain words": 7 `<details>`:
  1. "Can anyone see my bid?": "No. It locks on your device before it leaves. It unlocks only after bidding ends. Not even we can see it."
  2. "What do I pay?": "The final price times the tokens you get. Never more than your max price."
  3. "What if it's crowded?": "If more people want tokens at the final price than there are tokens, everyone at that price gets the same fair share."
  4. "Why does everyone lock the same bid money?": "So nobody can guess how big your bid is. What you don't spend comes back."
  5. "Who unlocks the bids?": "Three independent keepers each hold part of the key. Any two are enough."
  6. "What if something breaks?": "If bids can't unlock in time, anyone can press Refund everyone. Every cent comes back."
  7. "What happens to a bid that cheats?": "A bid made outside the app that doesn't unlock to what it promised loses its money. It's burned. Nobody gets it."
- ((SEE LIVE LAUNCHES)) at the end.

### 8.11 Not found `#not-found` and error `#error`

```
@error (shake once)  "Wrong door."      @error
Nothing here                            Something broke on this page
This page doesn't exist, or the         Reload to try again. Your bids and
launch link is wrong.                   money are on chain, not in this page.
((BACK TO LAUNCHES            ▸))       ((RELOAD ▸))   (Back to launches)
```

Any unknown hash shows Not found.

---

## 9. Mock data

Demo user: "0x3f8a…c2a1". USDC balance is $1,240.00, or $240.00 with "not enough". All launches pay in USDC on Monad testnet, with a lot size of 1.

| id | Name / ticker | Art (inside the badge) | Phase | For sale | Price options | Bid money | Bids | Timing | Kuru |
|---|---|---|---|---|---|---|---|---|---|
| `ncat` | NEONCAT / NCAT | Magenta badge. Black cat head (circle plus two triangle ears), yellow slit eyes, 3 cyan whisker lines each side. | live (main flow) | 3,000,000 | 12: $0.010 to $0.032, step $0.002 | $1,000 | 142 | closes in 14:32 | 300,000 NCAT + 20% of the money, 7 days |
| `snail` | TURBO SNAIL / SNAIL | Violet badge. Green snail body, yellow shell with a black lightning bolt. | starts soon | 2,000,000 | 16: $0.005 to $0.020, step $0.001 | $250 | 0 | opens in 2:10:44, lasts 1 hour | on |
| `ramen` | RAMEN RAT / RAMEN | Yellow badge. Grey-violet rat face, two chopsticks as ears, wavy paper noodle whiskers. | unlocking | 800,000 | 10: $0.020 to $0.038, step $0.002 | $500 | 30 | 12 of 30 unlocked | on |
| `moth` | MOTH MOTOR / MOTH | Cyan badge. Moth with two yellow headlight eyes and violet wings. | ready | 3,000,000 | 8: $0.004 to $0.011, step $0.001 | $300 | 57 | 57 of 57 unlocked | off |
| `frog` | CHROME FROG / FROG | Green badge. Frog face with a steel visor bar and a black mouth line. | stuck | 1,200,000 | 12: $0.010 to $0.032, step $0.002 | $500 | 30 | 0 of 30 unlocked | on |
| `goblin` | GLITCH GOBLIN / GOB | Coral badge. Green goblin head, huge pointed ears, one tooth, magenta eyes. **You are the creator.** | done | 1,000,000 | 11: $0.010 to $0.050, step $0.004 | $500 | 64 | ended 11 Oct 2026; final $0.010; 824,000 sold (82%) | 100,000 GOB + 20%, locked until 18 Oct 2026 |
| `coo` | PIXEL PIGEON / COO (created in the wizard) | Paper badge. Grey pigeon head, yellow beak, cyan eye. | starts soon | 100,000 | 11: $0.010 to $0.050, step $0.004 | $500 | 0 | opens in 4:59, lasts 30 min | 10,000 COO + 20%, 7 days |

**Main-flow bid:** max price $0.020, preset $500, so 25,000 NCAT. Check: $0.020 × 25,000 = $500 ≤ $1,000, and $500 comes back for sure.

Preset conversions at $0.020: $100 = 5,000; $250 = 12,500; $500 = 25,000; MAX = 50,000.

**Outcome math:**
- **WON:** final $0.016. 25,000 × $0.016 = $400.00 paid, $600.00 back. Sold out: 3,000,000 × $0.016 = $48,000 raised, so Kuru gets $9,600.00 and 300,000 NCAT.
- **FAIR SHARE:** final $0.020, which equals the max. 62% of 25,000 = 15,500 NCAT. 15,500 × $0.020 = $310.00 paid, $690.00 back.
- **MISSED:** final $0.022 > $0.020. $0 paid, $1,000.00 back.
- **MONEY BACK:** cancelled. $1,000.00 back.

**Creator math:** 824,000 × $0.010 = $8,240.00 raised. 20% to Kuru = $1,648.00, so you collect $6,592.00 and 176,000 unsold GOB.

**Wizard:** 100,000 COO; at the top price, 100,000 × $0.050 = $5,000.00. You send 110,000 COO.

**Unlocking (main flow):** NCAT starts at 88 of 142. One more unlocks every 2s, so the viewer can watch or press the button.

**Your other bids** (in My bids), so every public button leads to a real screen:

| Launch | Your bid | What the button does |
|---|---|---|
| RAMEN | 15,000 at up to $0.030 ($450 ≤ $500) | "Unlock the rest" → `#ready.ramen`. Reveal → `#missed.ramen`: final $0.032, $500.00 back. Kuru live at $0.032. |
| MOTH | 30,000 at up to $0.008 ($240 ≤ $300) | Reveal → `#won.moth`: final $0.007, got 30,000 MOTH, paid $210.00, $90.00 back. Kuru off, so no Kuru card. |
| FROG | 10,000 at up to $0.020 ($200 ≤ $500) | Refund everyone → `#refunded.frog`: $500.00 back |

Suffixed result hashes take that launch's numbers. Unsuffixed ones use NCAT.

Mock addresses: launch 0x5e1d…9b42, bid tx 0x7a3c…e1c4, token 0x44ab…0e3c, Kuru market 0x2d90…f1a7. External links point to `#` and show the toast "Demo: links open the explorer in the real app."

---

## 10. Prototype mechanics

### 10.1 Hash deep links

The format is `#screen` or `#screen.launch`, using only letters, digits, `.`, `_`, `~` and `-`. Without a launch suffix, screens use `ncat`, except the creator screens, which use `goblin`.

On load and on `hashchange`, parse the hash, apply its **state preset**, then render. Every deep link other than `#home` skips the intro.

| Hash | Screen | State preset |
|---|---|---|
| `#home` (or empty) | Home | – |
| `#how` | How it works | – |
| `#launch-soon` | Launch, starts soon | ncat phase soon (opens in 4:59). The SNAIL card links to `#launch-soon.snail`. |
| `#launch-live` | Launch, live | passkey user, $1,240, no bid |
| `#launch-guest` | Launch, live | signed out |
| `#launch-broke` | Launch, live | passkey user, $240 |
| `#launch-bid` | Launch, live | bid placed |
| `#locked` | Bid locked | bid placed |
| `#unlocking` / `#unlocking.ramen` | Unlocking | 88 of 142 / 12 of 30 |
| `#ready` / `#ready.moth` / `#ready.ramen` | Ready | all unlocked |
| `#stuck` / `#stuck.frog` | Stuck | 0 unlocked |
| `#won` `#fair-share` `#missed` `#refunded` (also `#missed.ramen`, `#won.moth`, `#refunded.frog`) | Result | bid placed, that outcome, Kuru live, not collected |
| `#creator` `#creator-trading` `#creator-unwind` `#creator-return` | Creator view | goblin, Kuru in that state |
| `#create-1` `#create-2` `#create-3` `#created` | Wizard | step 2 and 3 open with the example filled in |
| `#my-bids` `#my-launches` | Lists | passkey user |
| `#connect` | Connect modal over Home, or over the previous screen when opened in-app | signed out |
| `#not-found` `#error` | Error screens | – |
| anything else | Not found | – |

Navigation within the app uses `location.hash`. In-app links to a live launch pick the hash that matches the current state: signed out → `#launch-guest`; low balance → `#launch-broke`; already bid → `#launch-bid`; otherwise `#launch-live`. State-only changes inside a screen (signing in, unlocking becoming ready, collecting) use `history.replaceState` and keep form input.

### 10.2 Demo controls panel (`#demo`)

| Group | Controls (ids) |
|---|---|
| Jump to | `<select id="demo-jump">` listing every hash above, with plain names |
| You are | `#demo-user-guest` `#demo-user-passkey` `#demo-user-wallet` |
| USDC | `#demo-usdc-enough` ($1,240), `#demo-usdc-low` ($240) |
| NEONCAT is | `#demo-phase-soon` `-live` `-unlocking` `-ready` `-stuck` `-result` |
| Your result | `#demo-outcome-won` `-fair` `-missed` `-refunded` |
| Kuru card | `#demo-kuru-start` `-live` `-unwind` `-return` |
| Actions | `#demo-skip-time` (advance NCAT one phase), `#demo-fill` (fill the wizard example), `#demo-error` (show the error toast "You cancelled the request in your wallet." and Hush's error pose for 2s), `#demo-replay-intro`, `#demo-reset` (clear state, go to `#home`) |
| Comfort | `#demo-calm`, `#demo-sound` (mirror the top-bar toggles) |

Chip groups behave as radios and show the current state.

### 10.3 Control ids (stable, use exactly these)

| Area | Ids |
|---|---|
| Bid | `price-0`…`price-N` (radios, `name=price`, N = options − 1), `price-typed`, `amount-100`, `amount-250`, `amount-500`, `amount-max`, `bid-tokens`, `lock-bid`, `get-usdc`, `see-my-bid` |
| Phases | `unlock-rest`, `reveal-result`, `refund-everyone` |
| Result | `collect`, `collect-tokens`, `collect-money`, `creator-collect`, `creator-collect-money`, `creator-collect-tokens`, `kuru-start`, `kuru-open`, `kuru-unwind`, `kuru-return`, `all-bids`, `proof`, `trouble` |
| Create | `create-type-new`, `create-type-existing`, `create-name`, `create-ticker`, `create-supply`, `create-address`, `create-sale-tokens`, `create-low`, `create-high`, `create-options-minus`, `create-options`, `create-options-plus`, `create-bid-100`, `create-bid-250`, `create-bid-500`, `create-bid-1000`, `create-bid-money`, `create-duration-15`, `-30`, `-60`, `-1440`, `create-start-5`, `-60`, `-1440`, `create-advanced`, `create-kuru`, `create-kuru-tokens`, `create-kuru-money`, `create-kuru-days`, `create-back`, `create-next`, `create-submit`, `created-link`, `created-copy` |
| Shell | `skip-link`, `boot-skip`, `sign-in`, `account-chip`, `toggle-calm`, `toggle-sound`, `ticker-pause`, `connect-passkey`, `connect-wallet`, `connect-close`, `nav-home`, `nav-bids`, `nav-create`, `nav-launches` |
| Demo | as listed in §10.2, plus `demo-skip-inline` |

### 10.4 Main flow, click by click

1. `#home`. The intro plays on the first visit. Tap ((BID ON NCAT)) to go to `#launch-guest`, since the demo starts signed out.
2. Tap [$0.020]. The presets show token amounts and the receipt fills its first line. Tap [$500]. The receipt reads 25,000 / $500.00 / $500.00 of $1,000.
3. Tap ((SIGN IN TO BID)). Connect opens. Tap "Use a passkey", and the typed lines play. The modal closes, you're signed in with $1,240, and the form is unchanged. The button now reads LOCK IN MY BID.
4. Tap ((LOCK IN MY BID)). The loading labels play, then the Clamp, then `#locked` with its toast.
5. Tap the "DEMO: Skip to bidding close" pill or Skip time. Stage clear goes to `#unlocking` at 88 of 142.
6. Tap ((UNLOCK THE REST)). The count rolls to 142 over 800ms, then Stage clear, and the screen becomes Ready.
7. Tap ((REVEAL THE RESULT)). After "Revealing…", go to `#won` (or the outcome picked in the demo panel). The decode, loot drop and confetti play.
8. Tap ((COLLECT)). After "Collecting…" the COLLECTED stamp lands and the toast shows. Tap (Start trading on Kuru) if the Kuru card is in the start state.

Other paths:
- Bottom nav Create goes to `#create-1`. Fill or use `#demo-fill`, then Next, Next, Create launch, then `#created`, then See my launch (`#launch-soon.coo`).
- My bids goes to (Refund everyone) on FROG, then `#refunded.frog`.
- My launches goes to (Collect) on GOBLIN, then `#creator`.

---

## 11. Build constraints (the builder must follow all of these)

1. **One HTML file, as a fragment:**
   - No `<!doctype>`, `<html>`, `<head>` or `<body>`.
   - The file starts with `<title>Blindlaunch</title>`, then the font `<link>`s, then `<style>`, then markup, then scripts.
   - Set `color-scheme: dark` and an explicit `background: var(--night)` on the root wrapper and `html`.
2. **Fonts:** Google Fonts is the only external stylesheet host. Use exactly these two links (both verified):
   - `https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,500;0,600;0,700;1,700&family=Oxanium:wght@700;800&display=swap`
   - `https://fonts.googleapis.com/css2?family=Dela+Gothic+One&display=swap&text=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789%21%3F%24%25.-%20`
3. **Scripts** come only from cdnjs.cloudflare.com (preferred), cdn.jsdelivr.net/npm or unpkg.com. Each must be pinned to an exact version and be a UMD build that defines a global.
   - The only library is canvas-confetti: `https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.4/dist/confetti.browser.js` (defines `window.confetti`). cdnjs serves only the CommonJS build of this library, so don't use cdnjs for it.
   - Inject the script lazily before the first win reveal. If it fails to load, skip confetti silently.
   - Everything else is plain CSS, the Web Animations API (`el.animate`), CSS `linear()` springs and View Transitions, with feature checks.
   - No Motion, GSAP, NumberFlow or zzfx: the rolling numbers, count-ups and sound are short hand-written helpers.
4. No `alert`, `confirm` or `prompt`. Use toasts and the modal.
5. Every form control and button has a stable `id`, exactly as listed in §10.3.
6. No horizontal scroll at 390px. Side gutters are at least 16px. Test at 360, 390, 768, 1024 and 1366px.
7. Keyboard focus is always visible (§2.3). Add a skip link, "Skip to content". Every target is at least 44px.
8. `localStorage` and `sessionStorage` are used only inside try/catch. The page works when storage throws.
9. **Complete at first paint:**
   - Render the first screen synchronously from the hash.
   - Nothing sits at `opacity:0` waiting for an observer, and there are no scroll-triggered reveals.
   - Entrance animations start only from user-caused state changes.
   - Fonts use `display=swap`.
10. **Intro:** the intro may play, but content must be readable within about 1.5s. On any deep link other than `#home` it's skipped (§6.1).
11. Honour `prefers-reduced-motion` and calm mode exactly as in §6. Nothing flashes more than 3 times a second. Coral never flashes.
12. Original art and words only: draw everything as inline SVG or CSS.
    - None of these words anywhere: Cyberpunk, 2077, Edgerunners, Night City, Arasaka, Militech, Sandevistan, choom, preem, eddies.
    - No game fonts or logos.
    - No emoji as icons.
13. **Accessibility:** `aria-live` for the final price and toasts. `role=timer` for the countdown and `role=progressbar` for the meter. Native radios for chips. Real `<details>`. Glitched text keeps its real DOM text.

---

## 12. Port notes (React 19, Tailwind 4, Vite)

- **Tokens.** Put §2 into `@theme` in the app stylesheet:
  - Colours: `--color-void`, `--color-night`, `--color-panel`, `--color-raised`, `--color-paper`, `--color-ink`, `--color-line`, `--color-text`, `--color-muted`, `--color-yellow`, `--color-cyan`, `--color-magenta`, `--color-coral`, `--color-green`, `--color-violet`.
  - Fonts: `--font-sans` (Chakra Petch), `--font-num` (Oxanium), `--font-shout` (Dela Gothic One).
  - The type scale as `--text-*`, shadows as `--shadow-pop*`, and the two `linear()` springs as `--ease-spring` and `--ease-spring-soft`.
- **Utilities:**
  - `@utility cut-s|cut-m|cut-l`, the pseudo-element recipe. Add `@supports (corner-shape: bevel)` as an enhancement later.
  - `@utility halftone|scanlines|speedlines`.
  - `@custom-variant calm (&:where([data-calm=on], [data-calm=on] *));` and use it together with `motion-reduce:`.
- **Libraries in the app:**
  - `motion@13.4.0` (`motion/react`) inside `<MotionConfig reducedMotion="user">`, for springs, the loot drop and the Clamp. Use a shared `layoutId` from the receipt to Hush.
  - `@number-flow/react@0.6.2` replaces the hand-written roller for the countdown, counts and receipt.
  - `canvas-confetti@1.9.4`.
  - `zzfx@1.3.2`, or keep the WebAudio helper.
  - React Router `<Link viewTransition>` for the page wipe.
- **Routes:** `/` (Home), `/how`, `/launch/:id` (all phases), `/launch/:id/result`, `/create` (wizard state in the URL as `?step=`), `/me/bids`, `/me/launches`. Connect stays a modal.
- **Phase mapping** from `chain/model.ts` `phaseOf()`:

  | `phaseOf()` | New phase |
  |---|---|
  | `scheduled` | starts soon |
  | `bidding` | live |
  | `awaitingKeys`, `opening` | unlocking ("Unlock the rest" only when `opening`) |
  | `ready` | ready |
  | `cancellable` | stuck |
  | `settled` | done |
  | `cancelled` | money back |

- **Components to replace:**

  | Current (`components/ui.tsx` and others) | New |
  |---|---|
  | `PrimaryButton`, `SecondaryButton` | §5.1–5.2 |
  | `Badge` | `StatusChip` |
  | `GlassCard` | `Panel` (HUD) or `Slip` (paper) |
  | Bid form in `AuctionPage.tsx` | `PricePicker`, `AmountPicker`, `Receipt` |
  | `ResultPage.tsx` claim, `MarketCard`, `AllocationTable` | `LootCard`, `KuruCard`, `AllBids` |
  | `auction.tsx` status strip | `MissionTracker` |
  | `SealedPage.tsx` | the Locked screen |

- **Delete:** `ClearingSimulator`, `BotRaceDemo`, the SVG demand chart in `components/ui.tsx`, `Vault`, `MonadSection`, `TeamsCta`. Reword the remaining FAQ to §8.10.
- **Copy:** rewrite `state/errors.ts` in the new words. Examples:
  - `AlreadyBid` → "This wallet already has a secret bid in this launch."
  - `AuthorityBid` → "You made this launch, so you can't bid in it."
  - `BidsUnopened` → "Some bids are still locked. Unlock them first."
  - `Locked` → "The Kuru market is still locked."
  - Gas → "Not enough MON to pay the network fee."
- **Keep from the prototype:** the hash-state presets become Storybook-style fixtures, or a `?demo=` dev panel behind `import.meta.env.DEV`.

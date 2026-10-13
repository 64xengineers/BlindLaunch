# Research: neon-cartoon Blindlaunch

For the designer. Fits the hard rules in `brief.md` (USDC, fixed price options, 7 phases, 4 outcomes). Checked on 13 Oct 2026: library versions and CDN URLs (HTTP 200), font metrics (fontTools on the Google Fonts files), and contrast (WCAG formula).

## 1. Top 15 recommendations (ranked)

1. **Replace every chart with a three-line receipt.** The bid form, locked screen and result use one block. Before: "You get up to 20,000 NCAT · You pay at most $400 · $600 of your $1,000 comes back for sure". After: "Got 12,400 NCAT · Paid $297.60 · $702.40 back". *From:* MetaDAO's public refund math ("$1,000 in → $7.80 of tokens, $992.20 back"); Phantom's signed −/+ "estimated changes".
2. **One yellow button per screen.** The only primary action is `#FCEE0A` with black text and a cut corner; everything else is outline or text. CDPR chose yellow because "it conveys the information, it is also simple to remember". *From:* CDPR artist Janiszewski; pump.fun's single "place trade".
3. **Keep a mission tracker on screen.** A strip reads `BID IN SECRET → UNLOCK → RESULT → TRADING`. The current node is lit and shows its countdown or public button. "Stuck" and "cancelled" branch off in coral. *From:* the CP2077 HUD objective (top right); Magic Eden's stage chips with countdowns.
4. **Bid in two taps.** Max price is a row of chunky chips, one per creator price option (the row scrolls sideways when there are more than 8). Amount is dollar presets, `$100 / $250 / $500 / MAX`, converted to tokens; MAX = bid money ÷ price, rounded down to whole lots. A number field is the fallback. Never mark a price as "popular", because bids are secret. *From:* pump.fun, Jupiter and Hyperliquid presets; Uniswap CCA: "Each participant has two things: a budget and a max price."
5. **Teach with a 4-panel comic, not a diagram.** Flat colour, one sentence per panel, with the mascot acting it out: *Bid in secret / Bids unlock together / Every winner pays one price / Trading starts on Kuru*. *From:* pump.fun's numbered "how it works" modal; Edgerunners' flat cel look.
6. **Turn the secrecy into hype.** A header ticker shows only public events ("0x3f…a1 locked a secret bid 🔒", "GOBLIN trading live at $0.024"), plus a big "142 secret bids" counter. Addresses, timing and deposits are already public on chain; never show amounts. *From:* pump.fun's live feed; `docs/Blindlaunch-OnChain-and-Bid-Visibility.md`.
7. **Show the result as a loot drop.** The final price decodes from scrambled glyphs and locks. Then the buyer's card springs in, coloured by "rarity": WON yellow, FAIR SHARE cyan, MISSED coral ("all $1,000 back"), REFUNDED green. Confetti for wins only, and one "Collect" button. *From:* game loot reveals; the "Juice it or lose it" talk.
8. **Two style layers: HUD skeleton, cartoon skin.** Structure is the CP2077 HUD: 1px hairlines, one bottom-right cut corner, corner ticks, small mono labels (`LOT 01 // LIVE`). Hero moments are Edgerunners: 3px black outlines, a hard `4px 4px 0` shadow, flat colour blocks, halftone, speed lines, tilted stickers. Never both on one element. *From:* CPStyling.lua (game-matched widgets); the neobrutalism recipe.
9. **Fonts: Rajdhani for UI, Chakra Petch for display, Oxanium for numbers.** Rajdhani is the game's actual UI face and is free (OFL). Oxanium digits are tabular by default, so timers don't jitter. *From:* Fonts In Use; glyph inspection.
10. **Make every changing number roll.** Countdown, bid count, unlock progress, final price and amounts all use NumberFlow.
11. **Signature moment: the afterimage lock.** On "Lock in my bid", the card dashes into a padlock and leaves three colour-shifted afterimages (cyan, magenta, yellow). The padlock clamps shut, and a toast reads "BID LOCKED. Nobody can see it. Not even us." *From:* Edgerunners' bullet-time; Imaishi "spread out all the frames" with "varying shades of color for each frame".
12. **Unlock progress as a cell meter.** "12 of 30 bids unlocked" sits above 30 cells that flip from a cyan lock to open. *From:* game ammo and health segments.
13. **Loading screens teach.** Every wait shows one rotating tip: "You never pay more than your max." / "Everyone locks the same bid money, so nobody can guess your size." *From:* game loading tips.
14. **Glitch is punctuation, not wallpaper.** Bursts of ≤300 ms, only on state changes and small elements, never looping. Scanlines are static and never under body text. Add a "Calm mode" toggle. *From:* WCAG 2.3.1; game photosensitivity practice.
15. **Keep the identity original and IP-safe.** Our own logo, our own mascot (e.g. a cel-shaded runner whose visor is a padlock: "blind" bids) and our own words. No game names, logos, fonts or art. *From:* CDPR Fan Content Guidelines; CDPR's "Cyberpunk" trademark.

## 2. Palette

| Token | Hex | Role | Contrast on `#0A0A12` / `#1E1E30` |
|---|---|---|---|
| `--void` | `#0A0A12` | page background | – |
| `--panel` | `#141421` | cards | – |
| `--raised` | `#1E1E30` | inputs, hover | – |
| `--ink` | `#000000` | outlines, hard shadows, text on bright fills | – |
| `--text` | `#F2F0E6` | body (eggshell, after the game's beige menus) | 17.3 / 14.3 |
| `--muted` | `#9A98B0` | secondary text | 7.0 / 5.8 |
| `--dim` | `#6B6984` | decoration only, **never text** | 3.7 / 3.1 ✗ |
| `--yellow` | `#FCEE0A` | primary button, brand, *live*, WON | 16.3 / 13.5 |
| `--cyan` | `#00F0FF` | secret/locked, *unlocking*, focus ring, links, FAIR SHARE | 14.0 / 11.6 |
| `--magenta` | `#FF2A6D` | hype, *ready*, sticker fills | 5.5 / 4.5 |
| `--coral` | `#FF6154` | danger, last minute, errors, *stuck*, MISSED (≈ game HUD red) | 6.7 / 5.5 |
| `--green` | `#05FFA1` | money back, *done*/trading, REFUNDED | 14.9 / 12.3 |
| `--violet` | `#B48CFF` | *starts soon* | 7.6 / 6.3 |

- Text on any bright fill is black. **White on magenta is only 3.6:1.**
- Pure red `#FF003C` is 4.1–5.0:1: use it for fills, never small text.
- Never put yellow next to cyan as text against background (1.17:1), or magenta on yellow (3.0:1).
- Glow (`text-shadow`) only on display text ≥24px.

## 3. Type

| Role | Google Font | Weights | Fallback | Why |
|---|---|---|---|---|
| Display, buttons, stickers | **Chakra Petch** | 600, 700, 700i | `"Rajdhani","Arial Narrow",sans-serif` | Chamfered letter corners echo the cut frames; italic reads as speed. |
| UI and body | **Rajdhani** | 500, 600, 700 | `"Barlow Semi Condensed","Arial Narrow",system-ui,sans-serif` | The game's real UI face, under the OFL. Cap height is only 0.64 em, so set body at **18px/500** and labels at ≥15px/600. Never use 300/400 for body. |
| Numbers | **Oxanium** | 600, 700 | `ui-monospace,"JetBrains Mono",monospace` | Tabular digits by default (verified); squared techno shapes. |
| Optional "shout" | **Dela Gothic One** | 400 | `"Arial Black",Impact` | Anime-poster weight, with katakana. Only for 3–4 words (WON, LIVE, SOLD OUT). Load it with `&text=`, because the full file is 2.4 MB. |
| Addresses | system mono | – | `ui-monospace,Menlo,monospace` | No download. |

`https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,600;0,700;1,700&family=Oxanium:wght@600;700&family=Rajdhani:wght@500;600;700&display=swap` (verified). Use all caps only for labels of 3 words or fewer (+0.08em tracking). Skip Orbitron: it's too wide for UI.

## 4. Motion catalogue

| # | Name | Technique | Where | Reduced motion |
|---|---|---|---|---|
| 1 | **Cut frame** | `clip-path: polygon(0 0,100% 0,100% calc(100% - var(--cut)),calc(100% - var(--cut)) 100%,0 100%)`. Outline it with an inner layer inset 1–2px. Enhance with `@supports (corner-shape: bevel)` (Chromium 139+), which keeps borders and shadows. | panels, buttons | static |
| 2 | **Press sink** | `:active{translate:3px 3px;box-shadow:none}` in 80 ms. On hover the shadow turns magenta and a ▶ slides in. | buttons, chips | keep (state only) |
| 3 | **Glitch burst** | `::before/::after` with `content:attr(data-text)`, offset ±2px with magenta/cyan, `clip-path:inset()` keyframes in `steps(2)`, 250 ms, once. | state changes, primary hover | hide copies |
| 4 | **Neon ignite** | On mount: 2 opacity dips within 500 ms, then a steady glow. Never loops. | titles, logo | already lit |
| 5 | **Scan overlay** | Static `repeating-linear-gradient(transparent 0 2px,rgb(0 0 0/.25) 2px 3px)` at ≤8%. | hero, token art | static |
| 6 | **Boot line** | 3–4 typed lines (`> LINKING WALLET… OK`) in ≤1.2 s. Skippable, once per session. | first load, connect | final text at once |
| 7 | **Ticker crawl** | `translateX` on a duplicated list, 40 s linear. Pauses on hover/focus and has a ⏸ button. | header | static list |
| 8 | **Number roll** | NumberFlow, `line-height:.9`. | every live number | built-in instant swap |
| 9 | **Decode reveal** | Characters cycle `░▒▓` and katakana for 700 ms, settling left to right. The span is `aria-hidden`; an `aria-live` node gives the final value. | final price, token address | final value |
| 10 | **Afterimage lock** | Three tinted clones (60/40/20% opacity) trail the card into the padlock (Motion `animate` with `stagger(0.03)`, 450 ms), then the padlock does a `scaleY .85→1` spring. | "Lock in my bid" | fade + icon swap |
| 11 | **Loot drop** | Card springs from `scale .85→1` (stiffness ~380, damping ~22). Behind it, a speed-line `repeating-conic-gradient` (radial mask) and halftone `radial-gradient` dots on a 6px grid. Confetti in palette colours for wins. | result | card only |
| 12 | **Stage clear** | Tracker segment fills with a diagonal `clip-path` wipe, the node pops, and the toast "STAGE CLEAR: BIDS UNLOCKED" appears. Screen changes use a 300 ms diagonal View Transition. | phases, navigation | cross-fade |

**Libraries (exact pins; MIT unless noted)**

| Need | Prototype (CDN, verified) | React 19 + Tailwind 4 |
|---|---|---|
| Motion and springs | `https://cdn.jsdelivr.net/npm/motion@13.4.0/dist/motion.js` → `Motion.animate/stagger/inView` | `motion@13.4.0` (`motion/react`) inside `<MotionConfig reducedMotion="user">`. v14 (2 Oct 2026) is too fresh. |
| Rolling numbers | `import "https://cdn.jsdelivr.net/npm/number-flow@0.6.2/+esm"` → `<number-flow>`, `.update(v)` | `@number-flow/react@0.6.2` |
| Confetti | `https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.4/dist/confetti.browser.js`, `disableForReducedMotion:true` | `canvas-confetti@1.9.4` |
| Sound (off by default) | `import {zzfx} from "https://cdn.jsdelivr.net/npm/zzfx@1.3.2/ZzFX.js"` (<1 KB synth) | `zzfx@1.3.2` |
| Optional scramble/timelines | `gsap@3.15.0` + `ScrambleTextPlugin` (free since Apr 2025, Webflow licence) | skip; Motion plus a ~25-line hook is enough |
| Corners, glitch, scan, halftone | hand-written CSS (augmented-ui 2.0.0 is a 2020 stylesheet, and the prototype can't load stylesheets) | Tailwind `@theme` tokens, `@utility cut-corner`, `motion-safe:`/`motion-reduce:` |
| Page transitions | `document.startViewTransition` (Baseline Oct 2025) | React Router 7 `<Link viewTransition>` |

Animate only `transform`, `opacity` and `filter`. Never loop polygon `clip-path` animations: they cause GPU spikes.

## 5. Degen UX patterns to copy

- **pump.fun:** a one-line pitch ("Pump lets anyone create coins, giving everyone equal access…") and an honest risk line ("Prices can move quickly, so trade carefully."). Then coin cards (image, name, $TICKER, market cap, progress), a live feed, Buy/Sell tabs with quick presets (sell as 25/50/75/100%) and one button. Copy all of that; skip the hero price chart.
- **Phantom:** the confirm sheet shows signed, coloured balance changes (−$1,000 USDC / +up to 20,000 NCAT). That's our receipt.
- **Jupiter:** stacked "You're paying / You're receiving" boxes, HALF/MAX chips, and a button whose label *is* the validation ("Enter an amount" → "Not enough USDC" → "Lock in my bid"). Feed it the app's existing error sentences.
- **Hyperliquid:** sizes snap to 0/25/50/75/100%. Copy that as buttons, not drag; skip the order-book density.
- **Moonshot:** a curated list, email or Face ID sign-in, Apple Pay funding, no wallet pop-ups. Put the passkey option first in Connect.
- **Magic Eden launchpad:** stage chip + countdown, a "minted X / Y" bar, a quantity stepper, one Mint button. Put a phase chip and countdown on every launch card.
- **MetaDAO:** commit → fair share → refund, with public numbers (Rip Cars was 127× oversubscribed). Say "3× more demand than tokens", never "pro-rata".
- **Uniswap CCA / Aztec:** "Bidders compete on valuation, not speed." Borrow the tagline; skip the price-over-time chart.
- **Echo/Sonar, Legion, CoinList:** results show "Your allocation / Refund" as two numbers. Copy that; skip queues, scores and KYC walls.
- **letsbonk.fun, Believe:** mascot-led brands; launching takes one tweet. Copy the mascot, and a create step 1 of name, ticker and image with the rest under "Advanced".

## 6. Plain-language glossary

| Technical | UI says | Tooltip |
|---|---|---|
| Sealed bid, commitment | **Secret bid** / "Bid locked" | Only you can see it until bidding ends. Not even us. |
| Bid price | **Your max price** | The most you'd pay per token. You may pay less, never more. |
| Price ladder, steps | **Price options** | The creator set these. Pick one. |
| Deposit | **Bid money** ("$1,000 for everyone") | Same for everyone, so nobody can guess your size. Unspent money comes back. |
| Keepers publish keys, opening | **Bids unlock** (automatically) | Independent unlock bots post the key when bidding ends. |
| Public reveal call | **Unlock the rest** | Speeds it up. Anyone can press it. |
| Clearing price | **Final price** (everyone pays it) | Where every token sells out, or the starting price if they don't. |
| Minimum price | **Starting price** | – |
| Settle | **Reveal the result** | Anyone can press it once bids unlock. |
| Oversubscribed | **"3× more demand than tokens"** | – |
| Pro-rata allocation | **Fair share** | Bids above the final price get everything. Bids exactly at it split what's left, each getting the same %. |
| Refund / claim | **Money back** / **Collect** | Tokens and money in one tap. |
| Reclaim proceeds and unsold | **Collect your money and unsold tokens** | – |
| Kuru market seeding | **Start trading on Kuru** | Part of the raise and tokens open a market at the final price. |
| Cancel (keys never came) | **Refund everyone** | Every cent back to everyone. |
| Unrevealed / forfeited | **"Bid didn't unlock: full refund"** / "Cheating bid: money burned" | – |
| Gas | **Network fee** | – |

Ready-to-use copy:
- **WON:** "You got 20,000 NCAT at $0.015 each. $700 comes back."
- **FAIR SHARE:** "Crowded! You got 62% of what you asked for (12,400 NCAT) at $0.024. $702.40 comes back."
- **MISSED:** "The final price, $0.024, was above your $0.020 max. All $1,000 comes back."
- **REFUNDED:** "This launch was called off. All $1,000 comes back."
- **Hero:** "Secret bids. One price. No snipers."

## 7. Do-not list

**Anti-patterns**
- No charts, curves or simulators. One "82% sold" meter at most.
- No drag-and-drop and no slider-only inputs; every value is tappable and typeable. Nothing that only works on hover.
- No more than one yellow button per view.
- Nothing that hints at other bids during bidding.
- Don't celebrate risking money. Confetti is for a won result only. No streaks, no fake urgency. Robinhood dropped its trade confetti in 2021 after Massachusetts regulators called it gamification.
- Each phase and outcome = colour + icon + word, never colour alone.

**Accessibility limits**
- **WCAG 2.3.1:** no more than 3 flashes in any second (G19). No full-screen flashes. Never flash saturated red.
- Honour `prefers-reduced-motion` everywhere (column above), and add an in-app Calm mode (WCAG 2.3.3).
- **WCAG 2.2.2:** the ticker moves for more than 5 s, so it needs pause/stop.
- Text contrast ≥4.5:1. `--dim` and `#FF003C` are never used for text. No text over scanlines or halftone.
- Targets ≥44–48px. Body ≥18px Rajdhani 500. Glitched text keeps its real DOM text.
- Sound never autoplays and is off by default.

**IP: keep it "inspired by"**
- None of these words in the UI, marketing or domain: *Cyberpunk, 2077, Edgerunners, Night City, Arasaka, Militech, Sandevistan, choom, preem, eddies*, "Wake up, samurai". CDPR owns the "Cyberpunk" trademark for games, and its guidelines ban its names in domains and any implied endorsement.
- No game or anime logos (including look-alike glitched or split logotypes), screenshots, characters (Lucy, David, V, Johnny), icons or traced UI.
- No commercial game fonts (Refinery and Blender; the logo is custom art). Rajdhani, Orbitron and the faces above are OFL.
- Genre devices are fine: neon palettes, cut corners, glitch, scanlines, halftone.

## 8. References

**Cyberpunk 2077 look**
- https://fontsinuse.com/uses/60926/cyberpunk-2077-video-game: Rajdhani is the in-game UI; Orbitron is secondary.
- https://wnhub.io/news/marketing/item-4676: why CDPR chose yellow.
- https://www.hudsandguis.com/home/2019/cyberpunk-2077: off-red, text-led HUD; beige menus.
- https://github.com/Nats-ji/CPStyling.lua: game-matched colours (text ≈ `#FF6154`) and a cut-corner button.
- https://cdn.jsdelivr.net/npm/cybercore-css@0.3.0/README.md: fan palette (`#FCEE0A`, `#00F0FF`, `#FF2A6D`, `#05FFA1`).
- https://www.sitepoint.com/recreate-the-cyberpunk-2077-button-glitch-effect-in-css/: Jhey Tompkins' glitch button.
- https://augmented-ui.com/: HUD clip and corner ideas.
- https://gdcvault.com/play/1034160/User-Interface-in-Cyberpunk-2077: CDPR's UI talk.
- https://www.gameuidatabase.com/: HUD and loot screen references.

**Edgerunners, cartoon, game feel**
- https://awn.com/animationworld/cyberpunk-edgerunners-vibrant-ode-retro-anime: frame trails, a colour per frame.
- https://animetudes.com/2021/07/02/gainax-and-the-neo-kanada-renaissance/: Imaishi's bold "Neo-Kanada" line.
- https://freefrontend.com/css-neobrutalism/: outlines, zero-blur shadows, press sink.
- https://www.youtube.com/watch?v=Fy0aCDmgnxg: "Juice it or lose it".

**Degen and auction UX**
- https://pump.fun/board: pitch, risk line, cards, feed.
- https://solanacompass.com/news/metadaos-rip-cars-ico-closes-127x-oversubscribed-with-319m-in-commitments: refund math.
- http://developers.uniswap.org/llms.mdx/docs/liquidity/liquidity-launchpad/concepts/cca: "a budget and a max price".
- https://blog.uniswap.org/aztec-cca: "valuation, not speed"; 96% of bidders under $10k.
- https://www.coinbase.com/developer-platform/discover/case-studies/moonshot: less payment friction, +25% conversion.
- https://www.cnbc.com/2021/03/31/robinhood-gets-rid-of-confetti-feature-amid-scrutiny-over-gamification.html: limits of celebration.

**Motion and CSS**
- https://motion.dev/docs/react-accessibility: `reducedMotion="user"`.
- https://number-flow.barvian.me/: rolling numbers.
- https://github.com/catdad/canvas-confetti: reduced motion, custom shapes.
- https://github.com/KilledByAPixel/ZzFX: tiny sound effects.
- https://webflow.com/blog/gsap-becomes-free: GSAP plugins are free.
- https://css-tricks.com/glitch-effect-text-images-svg/: pseudo-element glitch.
- https://css-tricks.com/how-to-create-neon-text-with-css/: glow and flicker.
- https://www.smashingmagazine.com/2026/03/beyond-border-radius-css-corner-shape-property-ui/: `corner-shape: bevel`.
- https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available: View Transitions.

**Accessibility and IP**
- https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html: flash limits.
- https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html: motion opt-out.
- https://www.cdprojektred.com/en/fan-content: CDPR's rules.
- https://gameinformer.com/b/news/archive/2017/04/08/cd-projeckt-red-defends-its-39-cyberpunk-39-trademark: the "Cyberpunk" trademark.

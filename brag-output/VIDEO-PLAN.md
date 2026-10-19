# DriftLock Video Plan — 5 types × 5 iterations

Source of truth for every brag run. Each iteration below becomes its own timestamped
`brag-output-<YYYY-MM-DD-HHmmss>-<type>-I<N>/` directory containing `brag-plan.md`,
`composition/`, `brag.mp4`, `brag.jpg`, and `share-copy.txt` per the `/brag` skill.

Brand contract (every video):
- Ink #0a0a0f · emerald #10b981 (fixed) · signal red #ff4444 (broken) · amber #f59e0b (detected)
- JetBrains Mono for code/labels; Instrument Serif or clean sans for headlines
- Show real UI / real diffs — never abstract filler ("Show the thing")
- No generic SaaS language ("streamline your workflow" banned)
- 15–25s. Hook lands in first 2s. Mute-safe final frame.
- DriftLock-specific copy only: source → payment_method, Prisma 7, "$2,300/mo leaked 11 months", Dependabot/Renovate don't touch call sites, driftlock.dev

---
## Type 1 — "the-fix" : product demo, Stripe source → payment_method rewrite

Creative angle: the product fixes itself on camera. Red field dies, emerald replacement typed in, 3-row drift report builds (detected → suggested → PR opened). This is the existing brag (polished, landscape, 17.5s) used as the anchor.

| Iteration | Tone | Format | Duration | Creative variation |
|-----------|------|--------|----------|--------------------|
| T1-I1 | polished | landscape 1920x1080 | 17.5s | Quiet premium devtool film. Anchor. Existing composition. |
| T1-I2 | cinematic | landscape 1920x1080 | 20s | Trailer-scale: slow lock-stroke draw, RMS-breathed emerald glow, big mono type, held green flash. |
| T1-I3 | yc-parody | landscape 1920x1080 | 16s | Deadpan startup energy: "We pivot to APIs. Actually we just fix them." Dry delivery, fake-serious. |
| T1-I4 | chaotic | vertical 1080x1920 | 15s | Fast, loud, aggressive: rapid cuts, glitch-free but energetic, red→green slams, mobile-first. |
| T1-I5 | app-store | square 1080x1080 | 17s | Smooth feature-card clean: centered phone-frame PR sheet, app-store CTA "Install the GitHub App". |

Storyboard (all iterations share beats, pacing/tone differs):
- 0.0–2.6: "Changelogs don't get read." / "Migration guides get skipped." (zinc)
- 2.6–5.5: red `paymentIntent.source` slams in + "Stripe renamed a field."
- 5.5–13.5: 3 drift rows arrive (detected amber → suggested zinc → PR opened emerald); red→green character retype; hold green
- 13.5–end: lock mark draws in, "DriftLock", "APIs should maintain themselves.", driftlock.dev, CTA

---

## Type 2 — "origin-story" : founder story, Prisma 7 broke my app

Creative angle: personal pain → product. Founder's Prisma 7 breaking change right before interviews. Dependabot said "out of date" but never touched the code. Human, specific, credible.

| Iteration | Tone | Format | Duration | Creative variation |
|-----------|------|--------|----------|--------------------|
| T2-I1 | cinematic | landscape 1920x1080 | 20s | Personal film: slow reveals, founder photo avoided (use code + text only), long holds, quiet confidence. |
| T2-I2 | deadpan | landscape 1920x1080 | 16s | Dry, understated: "Prisma 7 shipped. I didn't notice. My app broke. Dependabot didn't fix it." |
| T2-I3 | polished | landscape 1920x1080 | 18s | Clean devtool: before/after Prisma call site, emerald fix, PR card. |
| T2-I4 | vertical | vertical 1080x1920 | 15s | Short-form founder story: punchy lines, fast cuts, mobile CTA. |
| T2-I5 | yc-parody | landscape 1920x1080 | 16s | Fake-serious: "I built a company because a dependency broke before my interviews." |

Storyboard:
- 0.0–3.0: Hook — black, one line: "Prisma 7 shipped. My Next.js app broke." (mono)
- 3.0–7.0: "Dependabot said out of date. It never touched the code." Show Prisma call site in red.
- 7.0–12.0: DriftLock appears — scans, diffs, opens the PR. Prisma call site retyped green.
- 12.0–end: "APIs should maintain themselves." + DriftLock lock + driftlock.dev

---

## Type 3 — "how-it-works" : explainer, 4 steps Scan → Capture → Diff → Fix PR

Creative angle: mechanism made visible. Four numbered steps animate in sequence on a dark canvas. Engineer audience.

| Iteration | Tone | Format | Duration | Creative variation |
|-----------|------|--------|----------|--------------------|
| T3-I1 | app-store | landscape 1920x1080 | 18s | Smooth feature-card clean: 4 step cards with mono numbers 01–04, subtle emergence. |
| T3-I2 | polished | landscape 1920x1080 | 17s | Quiet premium: slow card reveals, emerald accent on "Fix PR" step only. |
| T3-I3 | cinematic | landscape 1920x1080 | 20s | Trailer-scale: big numbers, sweeping transitions, RMS pulse on each step lock. |
| T3-I4 | chaotic | vertical 1080x1920 | 15s | Fast cuts between steps, energetic, mobile-first CTA "driftlock analyze ./src". |
| T3-I5 | deadpan | landscape 1920x1080 | 16s | Dry: "Scan. Capture. Diff. Fix PR." Four words, four cards, done. |

Storyboard:
- 0.0–2.0: Hook — "Four commands. One fix PR." 
- 2.0–6.0: 01 Scan — AST finds every vendor call site.
- 6.0–10.0: 02 Capture — sandbox proxy records real shapes.
- 10.0–14.0: 03 Diff — added / removed / type-changed, confidence 0–100.
- 14.0–end: 04 Fix PR — deterministic rename, PR via GitHub API. "Nothing merges without you." + driftlock.dev

---

## Type 4 — "renovate-vs-driftlock" : competitive, version bump vs code migration

Creative angle: side-by-side. Renovate/Dependabot bump package.json (grey, stuck). DriftLock migrates the call site (emerald, current). "They bump versions. We migrate code."

| Iteration | Tone | Format | Duration | Creative variation |
|-----------|------|--------|----------|--------------------|
| T4-I1 | yc-parody | landscape 1920x1080 | 16s | Deadpan: "Renovate bumps a version number. That's it. That's the whole joke." |
| T4-I2 | polished | landscape 1920x1080 | 18s | Quiet premium: split screen, grey left / emerald right, slow hold on "Result: stuck" vs "Result: current". |
| T4-I3 | cinematic | landscape 1920x1080 | 20s | Trayscale: big red X over version bump, green check over code migration, lock draw. |
| T4-I4 | chaotic | vertical 1080x1920 | 15s | Fast: grey line slams left, emerald line slams right, energetic CTA. |
| T4-I5 | app-store | square 1080x1080 | 17s | Feature-card clean: centered comparison cards, app-store CTA. |

Storyboard:
- 0.0–3.0: Hook — "They bump the version in package.json. DriftLock migrates the code."
- 3.0–8.0: Left (grey): Renovate — `stripe@16 → stripe@17`, call site untouched, "Result: stuck".
- 8.0–13.0: Right (emerald): DriftLock — `source → payment_method`, 1 file changed, PR opened, "Result: current".
- 13.0–end: "Nothing merges without you." + driftlock.dev

---

## Type 5 — "launch-cta" : launch, install GitHub App + driftlock.dev

Creative angle: direct response. Hook → product glimpse → CTA. For customers / Product Hunt / launch posts.

| Iteration | Tone | Format | Duration | Creative variation |
|-----------|------|--------|----------|--------------------|
| T5-I1 | app-store | square 1080x1080 | 17s | Feature-card clean: centered install button, "3 fix PRs free. Then credits." |
| T5-I2 | polished | landscape 1920x1080 | 18s | Quiet premium: slow PR-sheet reveal, emerald CTA "INSTALL GITHUB APP". |
| T5-I3 | cinematic | landscape 1920x1080 | 20s | Trailer-scale: lock mark draw, "APIs should maintain themselves.", held URL. |
| T5-I4 | chaotic | vertical 1080x1920 | 15s | Fast, loud: rapid install CTA, mobile-first, energetic. |
| T5-I5 | deadpan | landscape 1920x1080 | 16s | Dry: "Install the GitHub App. Review the PRs. Ship current code. driftlock.dev." |

Storyboard:
- 0.0–3.0: Hook — "APIs should maintain themselves." (lock mark)
- 3.0–9.0: Product glimpse — source → payment_method drift row + PR card.
- 9.0–14.0: CTA builds — "INSTALL GITHUB APP" + "driftlock.dev".
- 14.0–end: Held final frame, mute-safe, URL + Discord + GitHub.

---

## Render matrix (25 runs)

Each row below is one timestamped `brag-output-<ts>-<type>-I<N>/` to create.
Type / iterations share the type storyboard; only tone/format/duration/creative-direction change.

T1 the-fix:    I1 polished-land | I2 cinematic-land | I3 yc-parody-land | I4 chaotic-vert | I5 app-store-sq
T2 origin:     I1 cinematic-land | I2 deadpan-land | I3 polished-land | I4 chaotic-vert | I5 yc-parody-land
T3 how-works:  I1 app-store-land | I2 polished-land | I3 cinematic-land | I4 chaotic-vert | I5 deadpan-land
T4 renovate:   I1 yc-parody-land | I2 polished-land | I3 cinematic-land | I4 chaotic-vert | I5 app-store-sq
T5 launch:     I1 app-store-sq | I2 polished-land | I3 cinematic-land | I4 chaotic-vert | I5 deadpan-land

Run order: render T1-I1 (anchor) first to validate the pipeline, then the remaining 24.
Each run: write brag-plan.md → build composition → `hyperframes check` → render brag.mp4 → pick brag.jpg → share-copy.txt.

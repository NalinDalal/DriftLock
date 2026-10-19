# Brag Plan: DriftLock — T1 the-fix · I2 cinematic · landscape 1920x1080 · 20s

## What is this app?
DriftLock is "Dependabot, but for APIs" — scans codebases for vendor API call sites, captures live traffic to snapshot shapes, detects breaking changes, opens a GitHub PR with the fix. Nothing merges without review.

## The angle
The product fixes itself on camera. Cinematic trailer-scale: a real Stripe field (`paymentIntent.source`) dies red, glows with RMS-breathed emerald light, gets rewritten to `payment_method`, while a 3-row drift report (detected → suggested → PR opened) builds row by row. Lock mark draws in, tagline held. Slow reveals, long holds, confidence through stillness.

## Hook (first 2-3 seconds)
Black. A single emerald-tinted glow builds on ink. Then red `paymentIntent.source` slams in with "Stripe renamed a field." Holds 3s. The relatable wound every Stripe dev knows.

## Key moments (the middle)
- Two zinc pain lines: "Changelogs don't get read." / "Migration guides get skipped." (~1s apart)
- 3 drift report rows arrive ~1.1s apart (detected amber → suggested zinc → PR opened emerald)
- Character-by-character red→green retype of `source` → `payment_method`, emerald flash on lock
- Lock stroke-draw, "DriftLock", tagline "APIs should maintain themselves.", driftlock.dev, CTA "TRY THE BETA →"

## Outro / punchline
Lock mark draws in emerald. "DriftLock." Held tagline + URL. Silence-friendly final 2s hold. Mute-safe.

## User flow worth showing
Install GitHub App → drift detected on push → fix PR arrives → review and merge. Centerpiece: detection rows → red→green rewrite → PR card.

## Tone
- Preset: cinematic
- Creative direction: trailer-scale devtool film; slow reveals, long holds, RMS-breathed glow, big mono type
- Energy: dramatic

## Format: landscape — 1920x1080
## Duration: 20 seconds

## Visual identity (from the project)
- Background: #0a0a0f (ink)
- Accent: emerald #10b981 (fixed), signal red #ff4444 (broken), amber #f59e0b (detected)
- Text: #f8f8f9 (paper), zinc #a1a1aa (secondary)
- Display font: Instrument Serif (headlines); JetBrains Mono (code/labels)
- Strongest visual: before/after PR sheet + red→green code line rewrite

## Share copy (draft)
Introducing DriftLock: Dependabot, but for APIs. When Stripe renames a field, it rewrites your code and opens the PR. driftlock.dev

## Audio direction
- Role: warm cinematic bed with sparse professional accents
- Music: steady clean bed (109.96 BPM), bed at 0.3 from 0s, fade 19→20s
- Music cue guidance: strong cues at 8.74, 13.11, 17.47, 19.9; lock logo near 19.9
- Audio-coupled: keyboard ticks for retype; impactBell heavy on "PR opened"; soft impactBell on logo lock (~19.9)
- Audio-reactive: emerald glow and green flash breathe subtly with RMS. No waveforms.

## Storyboard
### Scene 1 — Opener — 5.5s (0.0–5.5)
"Changelogs don't get read." (0.3s) / "Migration guides get skipped." (1.3s) / red `paymentIntent.source` slams in (2.6s) with "Stripe renamed a field." (3.1s). Holds to 5.5.
### Scene 2 — The fix — 10.5s (5.5–16.0)
3 drift rows arrive ~1.1s apart: drift detected (amber) → fix suggested (zinc) → PR opened (emerald). Badge: "RUNS IN CI · GITHUB ACTION / CLI". Then red `source` deleted letter by letter with key ticks, `payment_method` typed white, line flashes emerald. Hold green to 16.0.
### Scene 3 — Outro — 4s (16.0–20.0)
Lock mark draws in emerald, "DriftLock" beneath, held tagline "APIs should maintain themselves.", URL driftlock.dev, emerald CTA "TRY THE BETA →" (2.9s local). Hold still to 20.0.

## Gate notes
- Composition: `brag-output-2026-10-18-183100-t1-the-fix-I2/composition/`
- `npx hyperframes check` must pass zero errors before render.
- Render: `brag.mp4` 1920x1080, 20s.

# Brag Plan: DriftLock

## What is this app?
DriftLock is "Dependabot, but for APIs" — it scans your codebase for vendor API call sites, captures live traffic to snapshot their shapes, detects breaking changes, and opens a GitHub PR with the fix. Nothing merges without review.

## The angle
The product fixes itself on camera. No feature list, no metaphor: a real Stripe field (`source`) dies red and gets rewritten to `payment_method` while a fix report builds row by row — then the repo's own headline closes it. Specific to DriftLock; no other product can show this exact moment.

## Hook (first 2-3 seconds)
Black. One red glowing line: `paymentIntent.source`. Above it, four words: "Stripe renamed a field." The line every Stripe dev has written, caught dead. Holds to 3s.

## Key moments (the middle)
- The honest problem in two short lines: "Changelogs don't get read." / "Migration guides get skipped." No stats, no invented authority — the Prisma story is the proof and it stays off-screen.
- The fix flow, recreated as working product: three drift-report rows arrive one by one (detected → suggested → PR opened), then the red code line is retyped green. Simulated typing with key ticks.
- The differentiator lands visually, never as a bullet: Renovate bumps a version number (one grey line), DriftLock rewrites the call site (the green line). Show, don't claim.

## Outro / punchline
Lock mark draws in. "DriftLock." Then, held: "APIs should maintain themselves." URL `driftlock.dev` beneath. Silence-friendly final 2s hold.

## User flow worth showing
Install GitHub App → drift detected on push → fix PR arrives → review and merge. The centerpiece scenes show the last three beats (detection rows → rewrite → PR card); install is implied by the PR card's repo header (`acme/payments` — fictional stand-in, not a real repo).

## Tone
- Preset: polished
- Creative direction: quiet premium devtool film
- Interpretation: slow reveals, long holds, mono type with wide tracking, restraint over energy; confidence through stillness, not speed.

## Format: landscape — 1920x1080
## Duration: 20 seconds

## Visual identity (from the project)
- Background: #0a0a0f (ink)
- Accent: emerald #10b981 (fixed), signal red #ff4444 (broken), amber #f59e0b (detected)
- Text: #f8f8f9 (paper), zinc #a1a1aa (secondary)
- Display font: Instrument Serif (headlines, from site) — body/mono: JetBrains Mono
- Body font: JetBrains Mono for code and labels
- Strongest visual element: the homepage before/after PR sheet (SHEET 01 style) + the red-to-green code line rewrite

## Share copy (draft)
Introducing DriftLock: Dependabot, but for APIs. When Stripe renames a field, it rewrites your code and opens the PR. driftlock.dev

## Audio direction
- Role: warm bed with sparse professional accents
- Music: happy-beats-business-moves-vol-12-by-ende-dot-app.mp3 (steady and clean, 109.96 BPM)
- Music treatment: bed at 0.3 from 0s, gentle fade from 17s, out by 20s; no ducking needed (no voice)
- Music cue guidance: bundled preset read; strong cues at 8.74, 13.11, 17.47 available. Lock logo landing near 17.47 (±0.15s). PR-card arrival near 13.11. Sequential row reveals snap to every other beat (~1.1s apart) so labels stay readable.
- Audio-reactive treatment: subtle; hero red glow and green flash breathe with RMS. No waveforms, no visualizers.
- SFX posture: sparse, motion-matched, professional restraint
- Audio-coupled moments:
  - Hook line — none (let the red glow + bed carry it)
  - Code retyping — keyboard keypress ticks, randomized across keyboard/ set
  - Drift rows arriving — interface/drop_001 per row, first and last only
  - PR card landing — impactBell_heavy_000, single hit
  - Logo/outro — interface/bong_001, soft, then silence under the hold
- Restraint rule: never more than one SFX family per scene; no glitch/error sounds (nothing is broken *in* the video, the video *shows* something broken)

## Storyboard

### Scene 1 — Hook — 3s (0.0–3.0)
Black frame. `paymentIntent.source` in red mono, glowing, centered. Above it, small: "Stripe renamed a field." (settles by ~0.8s, holds). Red glow breathes subtly (audio-reactive).
Sequential/interaction: none — one static wound.
Audio intent: bed establishes, no SFX. Let the silence after the bed entrance create tension.
Audio-coupled idea: none.
Music: vol-12 bed in at 0.3.
Transition mood: soft crossfade (0.5s) → Scene 2

### Scene 2 — Problem — 5s (3.0–8.0)
Two lines, centered, arriving 1.5s apart: "Changelogs don't get read." then "Migration guides get skipped." Zinc-grey, mono, calm. Nothing else moves except a faint vignette.
Sequential/interaction: yes — line 2 arrives at ~4.8s with a soft drop tick.
Audio intent: bed continues; the sparseness is the point.
Audio-coupled idea: drop_001 under line 2 only.
Music: steady.
Transition mood: soft crossfade (0.6s), timed near strong cue 8.74 → Scene 3

### Scene 3 — The fix — 8s (8.0–16.0)
Recreated working product on ink background. Top: three drift-report rows arrive one by one ~1.1s apart (beat grid, every other beat): "drift detected" (amber) → "fix suggested" (zinc) → "PR opened" (emerald). SFX on first and last rows only. Then the code line: red `source` deleted letter by letter with key ticks, `payment_method` typed in white, line flashes emerald. Hold green to 16s.
Sequential/interaction: yes — rows arrive in order; typing is simulated character by character.
Audio intent: quiet industry (ticks + two drops), then payoff.
Audio-coupled idea: keyboard ticks for every typed/deleted character; impactBell_heavy_000 exactly when "PR opened" lands (~13.11 strong cue).
Music: steady; no change.
Transition mood: soft crossfade (0.6s) → Scene 4

### Scene 4 — Outro — 4s (16.0–20.0)
Lock mark draws in (stroke draw), "DriftLock" beneath, then held line: "APIs should maintain themselves." URL `driftlock.dev` small beneath. Logo landing near 17.47 strong cue with bong_001. Everything holds still to 20.0 — mute-safe final frame.
Sequential/interaction: none after the draw.
Audio intent: resolution; bed fades 17→20s, bong rings over the fade.
Audio-coupled idea: bong_001 at logo lock (~17.5s).
Transition mood: none — hold to end.

**Music mood for this video:** steady and clean, quietly confident.
**Audio summary:** A calm corporate bed runs wall to wall while sparse ticks, drops, and two bell hits mark only the moments that earn them; the outro fades to near-silence under the held tagline.

# Hyperframes Composition Brief: DriftLock

## Objective
Create a short launch-style brag video for DriftLock.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20 seconds

## Source Material
- Project root: /Users/nalindalal/DriftLock
- Primary files read: apps/fe/src/routes/index.tsx (hero: "APIs should maintain themselves", before/after PR sheet mock), apps/fe/src/styles.css (ink/mono/emerald tokens), README.md (Dependabot-but-for-APIs), apps/video/src/*.tsx (existing Remotion timing reference: red hold → delete → type → green flash)
- Product name: DriftLock
- Tagline / strongest claim: "APIs should maintain themselves."
- Key UI or visual moment to recreate: the red `paymentIntent.source` line rewritten to emerald `paymentIntent.payment_method`, plus a 3-row drift report (detected → suggested → PR opened) in the homepage PR-sheet style
- Copy that must appear verbatim:
  - Stripe renamed a field.
  - Changelogs don't get read.
  - Migration guides get skipped.
  - drift detected / fix suggested / PR opened
  - DriftLock
  - APIs should maintain themselves.
  - driftlock.dev

## Creative Direction
- Tone preset: polished
- Creative direction: quiet premium devtool film
- Interpretation: slow reveals, long holds, restrained motion; confidence through stillness
- Angle: The product fixes itself on camera — a real Stripe field dies red and gets rewritten while a fix report builds row by row. No feature list, no metaphor.
- Hook: black frame, red glowing `paymentIntent.source`, "Stripe renamed a field." Holds 3s.
- Outro / punchline: lock mark draws in, "DriftLock", held tagline + URL, near-silence. Mute-safe final frame.
- Avoid:
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - Invented stats, testimonials, or employment claims — every number on screen must come from the storyboard; there are none

## Visual Identity
- Background: #0a0a0f
- Text: #f8f8f9
- Accent: emerald #10b981 (fixed), signal red #ff4444 (broken), amber #f59e0b (detected), zinc #a1a1aa (secondary)
- Display font: Instrument Serif for the tagline/outro headline; JetBrains Mono for code and labels (system font, no webfont fetch — determinism)
- Body font: JetBrains Mono
- Visual references from the project: homepage PR sheet (bordered panel, mono rows, BEFORE/AFTER structure), apps/video Remotion beats (proven timing: 15f hold → 5f/char delete → 3f/char type → green flash)

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook — 3s — red code line + "Stripe renamed a field.", must be readable by 0.8s
2. Problem — 5s — two zinc lines arriving 1.5s apart, must each hold ≥1.2s settled
3. The fix — 8s — 3 drift rows arrive ~1.1s apart, then character-by-character retype red→green, hold green
4. Outro — 4s — lock stroke-draw, name, tagline, URL; hold still to 20.0

## Audio
- Audio role: warm bed with sparse professional accents
- Audio arc: calm bed wall-to-wall, quiet industry mid-video (ticks + drops), two bell hits (PR + logo), fade to near-silence under the held tagline
- Music: happy-beats-business-moves-vol-12-by-ende-dot-app.mp3 (bundled, 109.96 BPM)
- Music treatment: bed at 0.3 from 0s, gentle fade 17→20s
- Music cue guidance: bundled preset at brag skill cues dir (vol-12 JSON); lock logo landing near 17.47 (±0.15s), PR-card arrival near 13.11; sequential rows snap to every other beat (~1.1s apart); ignore cues wherever they hurt readability
- Audio-reactive treatment: subtle; hero red glow and green flash breathe with RMS. No waveforms or visualizers.
- Audio-coupled moments:
  - Code retyping — keyboard keypress ticks, randomized across keyboard/ set
  - Drift rows — interface/drop_001 on first and last rows only
  - PR card landing — impactBell_heavy_000, single hit
  - Logo lock — interface/bong_001, soft
- SFX selection guidance: polished restraint; low high-frequency-risk files for repeated moments (ticks); one bell family for both payoffs so the video has a coherent sonic signature
- SFX analysis guidance: brag skill sfx-analysis.md/json; prefer low/medium HF-risk for the repeated key ticks
- Exact SFX choice: Hyperframes should choose filenames, timestamps, density, and volume based on the implemented animation.
- Audio files: copy the chosen music and any Hyperframes-selected SFX into `brag-output/composition/assets/`

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition contract + `data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec, beats, audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and `hyperframes-cli` (lint/check/render). /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project.
- Keep all text readable in the final render.
- Keep the video within 15-25 seconds.
- Include the planned music/SFX layer unless audio was explicitly disabled or documented as intentionally silent.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the visual animation exists.
- Treat music cue metadata as optional timing hints. Hyperframes decides exact animation timing and should ignore cues that hurt readability, scene pacing, or the product story.
- Major reveals may move toward nearby strong cues within about 0.15s. Smaller entrances may align to nearby beat points within about 0.10s. Use only 1-3 strong cue locks in a 15-25s video unless the edit clearly benefits from more.
- Use SFX to support motion and interaction: card sounds for card-like reveals, short announcement cues for major payoffs, key/click sounds for text or user actions, and restraint when the edit is already busy.
- Honor planned music treatment such as fade-outs, ducking, beat-aligned reveals, or letting a final SFX ring over the music, using the best Hyperframes-supported implementation.
- When music is present and the treatment is not `none`, consider Hyperframes audio-reactive workflow: extract audio data and use RMS/frequency bands for subtle, brand-specific motion. Good targets are glow, depth, background warmth, card presence, title emphasis, or other existing visual elements. Avoid waveform/equalizer visuals, musical-note graphics, generic particle systems, strobing, or heavy pulsing.
- Use local assets for audio and any required runtime/media dependencies when possible.
- Run `hyperframes check` before render — it is brag's single gate.

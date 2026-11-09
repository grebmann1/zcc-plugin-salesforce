# Agentforce Studio V3 — continuous app edit

User feedback: the editorial slides interrupted the demo. All three added cards
(test introduction, editor introduction and example request) have now been removed.
Narration carries the transitions over app footage. The original V2 opening is retained.
The previous reviews are preserved in `review-1/` and `review-2/`.

The edit reuses V2 through 86.350 seconds, then shows the earlier V1 test run and
self-healing workflow. At 122.300 seconds it cuts directly from Studio into the
staged editor-tool request. The voice says “Your editor can evolve, too” while the
request is typed. There is no intervening title or request card.

The staged sequence shows the request, source/check/reload progress, a new
**Export diagnostics** toolbar button, the diagnostics panel, and a sample JSON
download with 0 errors, 0 warnings and 5/5 scenarios. The app, source editor and
Monaco are real. The assistant, progress, toolbar button and export panel are
recording-only DOM staging in a disposable profile, as explicitly requested.
The sample JSON download was verified. This does not implement the tool in the
shipped plugin or prove a live model changed the editor. V1/V2 also use scripted
model and Salesforce responses, documented with those originals.

## Reproduce

`python3 media/agentforce-studio-v3/render-inapp.py` rebuilds this edit from the
original V1/V2 videos, existing raw recording and cached narration. It pads the
first app frame by 1.2 seconds to let the spoken bridge lead naturally into typing.
It uses real test-run footage under the self-healing introduction.

To recreate the raw staged scene, use `e2e/demo-agentforce-editor-v3.spec.ts` and
`record.mjs`, with `ZCC_DEMO_NARRATION` pointing to `durations-inapp.json`,
`ZCC_E2E_RECORD_VIDEO` pointing to the absolute `recording/` folder and
`ZCC_HOST_REPO` pointing to the Zana checkout. Run the recording runner with
`--grep 'extend the editor in place for V3' --workers=1`. Scene body is also stored
in `recording-body.ts`. Raw capture and download evidence remain in `recording/`.

## Current export

147.433 seconds (2:27), 1440×900 at 30 fps, H.264/AAC, 26 English caption cues,
six embedded chapters. Full decode, caption bounds, audio peak (−3.5 dB), browser
playback and chapter seeking passed. Inspection of transition frames and 122
sampled frames across the added sections confirms all added white cards are gone.
See `validation.json`, `playback-check.json` and `manifest.json`.

Local review deliverable only; original V1/V2 videos and public Help catalogue are preserved.

# Agentforce Studio V3 — staged in-app revision

The user requested replacing the slides after the example tool request with a staged
sequence in the app. The earlier review is preserved in `review-1/`.

The first section reuses V2 (`../agentforce-studio-thread/`), then the earlier V1
self-healing example. The example request card now cuts directly into the real
built Electron app. Every remaining shot stays there.

The staged sequence shows:

1. Typing “Add a tool to export this agent's diagnostics, including test results.”
   in an editor assistant beside the Agent Script.
2. Scripted source edits, checks, and a plugin reload.
3. A new **Export diagnostics** button appearing in the editor toolbar.
4. Opening it, inspecting errors/warnings and 5/5 sample test results, then exporting JSON.
5. Continuing in the same editor, without reinstalling.

The app, source editor and Monaco are real. The assistant, tool progress, new toolbar
button and export panel are **recording-only DOM staging** in a disposable profile,
as the user explicitly requested. The sample JSON is downloadable. This does not
implement the export tool in the shipped or installed plugin, or prove a real model
modified the editor. The earlier V1/V2 footage also uses scripted model and
Salesforce responses, as documented with those originals.

## Reproduce

From the Salesforce plugin checkout:

```sh
python3 media/agentforce-studio-v3/render.py --audio-inapp
ZCC_DEMO_NARRATION=$PWD/media/agentforce-studio-v3/durations-inapp.json \
ZCC_E2E_RECORD_VIDEO=$PWD/media/agentforce-studio-v3/recording \
ZCC_HOST_REPO=/path/to/zana-command-center \
  node media/agentforce-studio-v3/record.mjs --grep 'extend the editor in place for V3' --workers=1
python3 media/agentforce-studio-v3/render-inapp.py
```

`e2e/demo-agentforce-editor-v3.spec.ts` contains the disposable app fixture and scene.
The scene body is also stored in `recording-body.ts`. `recording/` retains the raw
video, timing, sample export and screenshots.

The original V2/V1 exports and the public Help catalogue are preserved. This local
review deliverable is not published.

## Current export

157.8 seconds (2:38), 1440×900 at 30 fps, H.264/AAC, 28 English caption cues and six embedded chapters. The in-app sequence starts at 133.867 seconds. Full decode, audio peak (−3.0 dB), caption bounds, browser playback/seeking, and the staged sample download passed. See `validation.json` and `playback-check.json`.

# How to build an Agentforce Agent in Zana

`agentforce-studio-thread.mp4` is a 91-second narrated video: an 11-second animated
opener, then the screen recording. 1440 × 900, 30 fps, H.264/yuv420p with AAC audio
and fast-start playback. Published as the Help video `build-an-agentforce-agent`
(Zana's `content/videos/catalogue.json`).

The walkthrough, in the Northstar support sample:

1. The opener: the title, then a Pi thread with the **SF-Pi plugin** asks
   "Build a Northstar support agent for order status and returns." and gets the
   compiled agent card.
2. In the app, a Pi thread writes `Northstar.agent` and compiles it. Its card opens the
   agent in the thread's side panel.
3. **Preview**: one conversation, with its trace.
4. The fix: "Make it 30 days, then write 5 test scenarios and run them." Pi edits the
   file, writes five scenarios (Return policy, Late return, Order details, Delayed
   delivery, Stay in scope), and starts a simulation batch, 4 in parallel. **5/5 pass**.
5. The ending: **Open in Studio**, with the script showing 30 days, the CheckReturn
   Flow canvas, the `c__OrderStatus` Lightning Type and its `c/orderStatusCard`
   component, then back to the Script tab.

Captured from an isolated Electron build with
`e2e/demo-agentforce-studio-thread.spec.ts`. The renderer, the Pi
bridge and every Salesforce tool are real. The Pi model process is the fake Pi playing
`FAKE_PI_SCRIPT` (say / pause / tool + capture / write steps). Its model label is set
neutral (`FAKE_PI_MODEL_NAME`), and the host is renamed before recording. Salesforce
replies are the spec's fixtures. No model or org was called.

Voice: **Microsoft Ava Multilingual Neural** (`en-US-AvaMultilingualNeural`, `-5%`).
Each line starts as its action begins, and the spec waits for the line to end. The
music bed and sound effects (`music.cjs`) come from the Zana demo cut, ducked under the
voice. The mix is normalized to -16 LUFS, -1.5 dBTP. Captions are the spoken lines,
in the SRT/VTT.

## Redo it

```sh
# from the plugin checkout root; build first: npm run build && npm run package
python3 media/agentforce-studio-thread/render.py --audio   # narration.json → audio-neural/ clips + durations.json
REC=/tmp/af-v2-rec; mkdir -p $REC
ZCC_DEMO_NARRATION=$PWD/media/agentforce-studio-thread/audio-neural/durations.json \
ZCC_DEMO_TIMELINE=$REC/timeline.json ZCC_E2E_RECORD_VIDEO=$REC ZCC_HOST_REPO=<zana checkout> \
  npm run test:electron -- --grep "agent from a thread"
python3 media/agentforce-studio-thread/render.py --mix $REC   # trim at the black flash, opener, mix, mux, captions, poster
```

Requirements: `python3 -m pip install edge-tts`, `ffmpeg`, and Playwright Chromium for
`intro.cjs`, which resolves `@playwright/test` from the Zana checkout: prefix `--mix` with
`NODE_PATH=<zana checkout>/node_modules`. The cached `.mp3` clips in `audio-neural/` are
committed, so later renders work offline. Renders (`*.mp4`, `*.wav`) are gitignored.

Keep these in step:

- **Narration and spec:** `narration.json` ids are the spec's `say(id)` calls, in the
  same order. `--mix` asserts this.
- **Opener timing:** `INTRO_LINES` in `render.py` must match `VO` and `DURATION` (11.0)
  in `intro.html`. Preview frames with
  `node intro.cjs stills <dir> <app.jpg> <vo-seconds,...> <t>...`.
- **Narrated script changes:** when Pi's scripted reply changes, update both the
  `FAKE_PI_SCRIPT` steps and the matching narration line.

To publish, copy the mp4, `poster.jpg` and `.en.vtt` into Zana's `content/videos/media/` as
`<id>-<sha256>.<ext>`, update the catalogue entry, and run
`pnpm exec tsx scripts/check-help-videos.ts` there (see its `content/videos/README.md`).

## Files

- `agentforce-studio-thread.mp4`, `.en.srt` / `.en.vtt`, `poster.jpg`: video, captions, thumbnail.
- `render.py`: narration synthesis and the final mix.
- `intro.html` / `intro.cjs`: the opener (`render(t)`) and its frame-by-frame capture.
- `music.cjs`: music bed and sound effects.
- `narration.json`: spoken lines by `say()` id. `narration.txt` and `voiceover.wav` are outputs.

Known product gaps seen while recording (worked around, not fixed): the thread Tests
tab lists only saved suites, not simulation batches. An open Agent tab doesn't refresh
after `files.write`. Raw tool JSON shows in the timeline.

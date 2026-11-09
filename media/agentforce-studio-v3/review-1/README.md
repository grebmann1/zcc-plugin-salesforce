# Agentforce Studio — V3 review cut

Extends **V2: How to build an Agentforce Agent in Zana** using the existing
`../agentforce-studio-thread/agentforce-studio-thread.mp4`. V2's opener and walkthrough
are reused up to 1:26.350, immediately before its closing sentence.

A brief introduces a separate 2/3 policy regression run, then V1's original recording
shows the bounded self-healing loop, a 3/3 candidate, diff review, and verification.
The source is `../agentforce-studio/agentforce-studio.mp4`, 1:03.600–1:33.650.

The final chapter explains extending and repairing the **editor plugin itself**:
ask a coding agent to change its source, verify it, rebuild and reload in place.
The example request is “Add a tool to export this agent's diagnostics.” This is an
editorial workflow illustration, **not a recording of that tool being implemented**.
It does not introduce a product feature or modify the installed plugin.

“No reinstall” applies to the local source-linked plugin authoring workflow. It
still requires a successful build and reload. New agent tool definitions may require
a fresh turn/session. Marketplace installations require the appropriate local source
workflow first; this cut does not claim every installed plugin modifies itself.

The retained built-Electron footage uses deterministic model and Salesforce fixtures,
as documented with V1 and V2. The separate test run is identified before the cut so
V2's five passing scenarios are not mistaken for the V1 three-scenario regression.

## Files

- `agentforce-studio-v3.mp4`: H.264/AAC review cut, optional embedded English subtitles.
- `agentforce-studio-v3.en.vtt` / `.en.srt`: captions for the complete edit.
- `poster.jpg`, `index.html`: poster and captioned player with chapter navigation.
- `transcript.md`, `manifest.json`: spoken script, edit timings, provenance, final hash.
- `narration.json`, `audio-neural/`, `render.py`: editable additions, matching Ava voice.
- `edit/`: generated cards, video segments, and chapter metadata.

## Reproduce

Requires Python Pillow and edge-tts, FFmpeg, and the original V1/V2 exports.

```sh
python3 media/agentforce-studio-v3/render.py --audio
python3 media/agentforce-studio-v3/render.py --render
```

The source-linked plugin authoring workflow is documented in the Zana CLI
`zcc guide plugins` and the repository's
`apps/server/src/services/extensions/AGENTS.md` (“Plugin authoring must work outside checkout”).

This is a local review deliverable. V1, V2 and the public Help catalogue are preserved.

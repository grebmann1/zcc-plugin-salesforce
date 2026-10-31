# Agentforce Studio in Zana

`agentforce-studio.mp4` is a 105-second narrated tour of Agentforce Studio: an animated
opener, then the screen recording. 1440 × 900, 30 fps, H.264/yuv420p with AAC audio.
Published as the Help video `agentforce-studio-tour` (Zana's `content/videos/catalogue.json`).

The walkthrough, in the Northstar support sample:

1. Northstar Support open in the Studio, then the Graph view.
2. The action tabs: Apex, the Flow canvas, and the order lookup's Lightning Type and card.
3. Preview catches the bug: the agent says 14 days, but the policy is 30.
4. The agent writes three test scenarios into the Scenarios tab and runs them as a
   batch. Two of three pass, and the judge explains the failure.
5. Heal: the attempts are tested against the same batch, going from 2/3 to a best of
   3/3. Review the diff, accept it, and save. The re-check passes 3/3.

The narration ids, in `say()` order, are: studio, graph, apex, flow, type, preview,
scenarios, batch, failure, heal, best, review, confirm, outro.

`v1/` is the frozen V1 release: captions, poster, `narration.json` and a copy of the
recording spec. Its mp4 is the published Help video in Zana's `content/videos/media/`. Leave it
unchanged. The files at this level are the working copy, identical to V1 today.

Captured from an isolated Electron build with
`e2e/demo-agentforce-studio-build.spec.ts` (grep "build an agent").
The Salesforce replies are fixtures. No model or org was called. The voice, music and
mix pipeline are the same as in
[`../agentforce-studio-thread/README.md`](../agentforce-studio-thread/README.md).

## Redo it

```sh
# from the plugin checkout root; build first: npm run build && npm run package
python3 media/agentforce-studio/render.py --audio   # narration.json → audio-neural/ clips + durations.json
REC=/tmp/af-v1-rec; mkdir -p $REC
ZCC_DEMO_NARRATION=$PWD/media/agentforce-studio/audio-neural/durations.json \
ZCC_DEMO_TIMELINE=$REC/timeline.json ZCC_E2E_RECORD_VIDEO=$REC ZCC_HOST_REPO=<zana checkout> \
  npm run test:electron -- --grep "build an agent"
python3 media/agentforce-studio/render.py --mix $REC   # trim at the black flash, opener, mix, mux, captions, poster
```

`narration.json` ids must match the spec's `say()` order. The `INTRO_LINES` in
`render.py` must match the `VO` timings in `intro.html`.

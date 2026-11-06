# Agentforce Studio · Q4 concept

Interactive, local design proposal. Open `http://127.0.0.1:5197/` on this Mac while the preview server is running. The prototype is independent of the installed Salesforce plugin. All conversations, commands, metrics, evaluations, and lifecycle operations use simulated data.

```sh
python3 -m http.server 5197 --bind 127.0.0.1 --directory prototypes/agentscript-q4
```

Start with **Try the fix flow**: failed case → suggested fix → apply to draft → compare → save and rerun. Other useful interactions are the tool launcher (+), tool expansion, case search and selection, session filters and replay, scorer creation, experiments, comments. **Reset** restores the initial review scenario. Mock drafts are stored under `agentscript-q4-concept` in this origin’s local storage.

The recommended layout keeps Zana’s explorer, center editor, bottom diagnostics, and tabbed right side tools. The outer browser panel can be maximized to inspect the full layout. Small viewports switch between Editor and Side tools. Both explorer and tool seams resize using pointer drag or arrow keys.

## Reference and provenance

- Source: [jonmoore/builder-shell-framework](https://git.soma.salesforce.com/jonmoore/builder-shell-framework/tree/codex/q4-2026).
- Requested Q4-2026 reference resolves to **`codex/q4-2026`**, commit **`f42909355021981fffaceb01b169ebe90b49c96c`**. There is no literal `Q4-2026` branch in the fetched remote heads.
- Visual authority: `DESIGN.md`, `src/styles/themes/builder-theme.css`, editor and tool templates, and work-area tab styles in that revision. White surfaces, gray-95 recessed surfaces, gray-90 seams, 8px controls, system typography capped at weight 500, neutral primary actions, and blue selected states follow that reference.
- Canvas authoring and its external editor integration are deferred, per the current scope decision. Script is the default editor; Graph remains available alongside all side panel tools.
- Thirteen SVG assets in `assets/` are copied from that revision’s `public/img/`. Copyright 2026 Salesforce, Inc.; Apache 2.0. The source license is retained in [assets/BUILDER-LICENSE.txt](assets/BUILDER-LICENSE.txt). Other prototype code is authored for this proposal.

## Tool placement

| Region | Tools |
| --- | --- |
| Center editor | Script (default), Graph; configuration and variables |
| Right tool tabs from Builder | Preview + inspector, Sessions + replay + treemap, Analytics, Issues + fix review, Scorers, Evals + case results + run history, Testing + profiles, Experiments, Compare, Files + artifact viewer, Terminal, Settings, custom-tool import |
| Retained Studio tools | Assistant, Actions + source and contracts, Comments, Org preview |
| Bottom panel | Problems, Trace, Output, Tests |

**Fidelity limits:** this is an interactive concept rather than an integration. Charts and version diffs use representative fixtures. Script editing has no parser or LSP; Graph uses a representative fixture. File input stores names only. Some secondary forms preview a workflow without creating real resources. Scorer and experiment creation, custom tool tabs, comments, conversations, draft changes, case selection, and the guided fix flow update local mock state. The three-agent picker previews the catalog; Service Agent is the fully populated workspace.

## Verification

Install this repository’s locked development dependencies (`npm ci`) to run the DOM tests. The runtime prototype itself needs no build or npm dependencies.

```sh
node --test --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-include='prototypes/agentscript-q4/*.mjs' --test-coverage-exclude='**/*.test.mjs' prototypes/agentscript-q4/concept.test.mjs
```

The tests exercise all tool surfaces, the complete fix journey, filtered select-all behavior, escaping, comments/chat, scorer/experiment/custom-tool creation, source navigation, and layout/keyboard state. No product runtime files are modified by this proposal.

Shell work uses Zana’s existing Terminal; this proposal does not provide a separate console.

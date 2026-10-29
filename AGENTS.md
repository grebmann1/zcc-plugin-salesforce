# Salesforce plugin

Independent Zana plugin. Runtime identity: `salesforce`. Keep Salesforce and Agentforce Studio together. Core changes belong in salesforce/zana; do not import its source or rely on a parent checkout.

Build: `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run package`, `npm run check:package`. Runtime releases contain compiled bundles and declared assets only. SDK/UI snapshots in vendor are MIT-licensed pinned build inputs with provenance; refresh them deliberately. Never ship credentials. Keep path/project authorization, approvals, output bounds, cleanup and storage compatibility intact. New code requires meaningful tests with at least 80% coverage. Verify host-facing changes in the built Electron app with an isolated profile; never change the user's live installation as a test.

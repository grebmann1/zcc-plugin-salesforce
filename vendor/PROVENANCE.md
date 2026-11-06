# Vendored development dependencies

The Zana plugin SDK and UI snapshot come from salesforce/zana at 643e1a124d0ee213e8733e1da543684f5a676c50 plus the working SDK/UI changes present during extraction on 2026-10-29. Both are MIT-licensed; see LICENSE. The SDK is not currently published on public npm. They are local, versioned build inputs; the released runtime has no workspace dependency. The existing sf-agentic-tools tarball, checksum and notices remain in this directory.

Local UI compatibility patch (2026-11-05): `popover-picklist.tsx` accepts bounded `triggerProps` for validation, help-text, blur and data attributes. This preserves field accessibility when replacing native selects. Disabled triggers (including inherited fieldsets) cannot select portaled options. Menu navigation stops propagation so searchable lists move one row per key and Escape closes only the picker. Tab closes the menu and resumes the owning form’s focus order. Covered by `src/app/components/SalesforcePicklist.dom.test.tsx`; no upstream dependency refresh.

AGENTSCRIPT_LICENSE.txt preserves the Apache 2.0 license supplied by the pinned @sf-agentscript/agentforce 2.10.38 dependency. The compiled distribution includes it alongside the plugin NOTICE and the bundled toolkit/visualizer notices.

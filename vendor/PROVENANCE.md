# Vendored development dependencies

The Zana plugin SDK and UI snapshot come from salesforce/zana at 643e1a124d0ee213e8733e1da543684f5a676c50 plus the working SDK/UI changes present during extraction on 2026-10-29. Both are MIT-licensed; see LICENSE. The SDK is not currently published on public npm. They are local, versioned build inputs; the released runtime has no workspace dependency. The existing sf-agentic-tools tarball, checksum and notices remain in this directory.

AGENTSCRIPT_LICENSE.txt preserves the Apache 2.0 license supplied by the pinned @sf-agentscript/agentforce 2.10.38 dependency. The compiled distribution includes it alongside the plugin NOTICE and the bundled toolkit/visualizer notices.

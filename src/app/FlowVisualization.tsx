import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2, Scan, Workflow } from 'lucide-react';
import type { FlowVisualization as VisualizationData } from '../../lib/flow-visualizer.js';
import { ActionFlowMap } from './ActionFlowMap.js';
import type { FlowModel } from './action-flow.js';
import { readDocumentTheme } from './playground-bridge.js';
import { LoadingState } from './components/SalesforceState.js';

function OfficialFlowFrame({ visualization, pluginId, theme, onFailure, onClose }: {
  visualization: VisualizationData; pluginId: string; theme: 'light' | 'dark'; onFailure(): void; onClose?(): void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const [viewportVersion, setViewportVersion] = useState(0);
  const [readyVersion, setReadyVersion] = useState<number>();
  // The upstream viewer fits only on mount. Refit once resizing settles, rather
  // than asking users to repair the viewport after changing the panel size.
  useEffect(() => {
    let size: { width: number; height: number } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      if (size && (size.width !== width || size.height !== height)) {
        clearTimeout(timer);
        timer = setTimeout(() => setViewportVersion(version => version + 1), 200);
      }
      size = { width, height };
    });
    observer.observe(container.current!);
    return () => { observer.disconnect(); clearTimeout(timer); };
  }, []);
  useEffect(() => {
    const timeout = window.setTimeout(onFailure, 10_000);
    const listener = (event: MessageEvent) => {
      // sandbox=allow-scripts gives this frame an opaque origin. A sibling frame,
      // even one on our server, cannot request the snapshot or issue commands.
      if (event.source !== frame.current?.contentWindow || event.origin !== 'null') return;
      if (event.data?.type === 'REQUEST_PLUGIN_DATA') {
        frame.current?.contentWindow?.postMessage({ type: 'PLUGIN_DATA_RESPONSE', payload: {
          data: visualization.data,
          context: { filePath: `/flow-preview/${visualization.fileName}`, fileName: visualization.fileName },
          // Deliberately omit selectableNodes: this is a viewer, not Vibe Edit.
        } }, '*');
        window.clearTimeout(timeout);
        setReadyVersion(viewportVersion);
      } else if (event.data?.type === 'FLOW_PREVIEW_CLOSE') {
        onClose?.();
      } else if (event.data?.type === 'PLUGIN_ERROR') {
        window.clearTimeout(timeout);
        onFailure();
      }
    };
    const element = frame.current;
    element?.addEventListener('error', onFailure);
    window.addEventListener('message', listener);
    return () => { window.clearTimeout(timeout); window.removeEventListener('message', listener); element?.removeEventListener('error', onFailure); };
  }, [visualization, onFailure, onClose, viewportVersion]);
  return <div ref={container} className="af-flow-official">
    {readyVersion !== viewportVersion && <div className="af-flow-loading"><LoadingState compact art="code" label="Drawing Flow…" /></div>}
    <iframe key={viewportVersion} ref={frame} title="Salesforce Flow visualizer" sandbox="allow-scripts"
      src={typeof process !== 'undefined' && process.env.VITEST ? 'about:blank' : `/plugins/${encodeURIComponent(pluginId)}/assets/flow-visualizer/${theme}.html`}
      className="af-flow-frame" />
  </div>;
}

function FlowViewControls({ expanded = false, onFit, onToggle }: { expanded?: boolean; onFit(): void; onToggle(): void }) {
  const ToggleIcon = expanded ? Minimize2 : Maximize2;
  return <div className="af-flow-view-controls">
    <button type="button" className="af-flow-control" aria-label="Fit view" data-tooltip="Fit the Flow to the current space" onClick={onFit}>
      <Scan size={15} aria-hidden="true" /><span>Fit view</span>
    </button>
    <button type="button" className="af-flow-control af-flow-control-icon" aria-label={expanded ? 'Close Flow' : 'Expand Flow'}
      aria-haspopup={expanded ? undefined : 'dialog'} data-tooltip={expanded ? 'Exit expanded view (Esc)' : 'Expand Flow'} onClick={onToggle}>
      <ToggleIcon size={15} aria-hidden="true" />
    </button>
  </div>;
}

function ExpandedFlow({ title, children, onClose, onFit }: { title: string; children: ReactNode; onClose(): void; onFit(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current!;
    element.showModal();
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="af-flow-dialog" aria-label="Expanded Flow" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div className="af-flow-dialog-title"><Workflow size={18} aria-hidden="true" /><div><strong>{title}</strong><small>Read only</small></div></div><FlowViewControls expanded onFit={onFit} onToggle={onClose} /></header>
    <div className="af-flow">{children}</div>
  </dialog>;
}

export function FlowVisualization({ visualization, error, model, pluginId, sourceLabel, onOpenTarget }: {
  visualization?: VisualizationData; error?: string; model: FlowModel; pluginId: string; sourceLabel?: string; onOpenTarget(target: string): void;
}) {
  const [theme, setTheme] = useState(readDocumentTheme);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [viewportVersion, setViewportVersion] = useState(0);
  const close = useCallback(() => setExpanded(false), []);
  // Stable callback: avoid tearing down the handshake on parent renders.
  const [fail] = useState(() => () => setFailed(true));
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readDocumentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  const targets = [...new Set(model.nodes.flatMap(node => node.target ? [node.target] : []))];
  if (!visualization || error || failed) return <>
    {(error || failed) && <p className="af-action-note" role="status">{error || 'The interactive viewer could not load.'} Showing the basic map.</p>}
    <ActionFlowMap model={model} onOpenTarget={onOpenTarget} />
  </>;
  const canvas = <>
    <OfficialFlowFrame key={`${theme}:${viewportVersion}`} visualization={visualization} theme={theme} pluginId={pluginId} onFailure={fail} onClose={expanded ? close : undefined} />
    {targets.length > 0 && <details className="af-flow-dependencies"><summary>Related implementations · {targets.length}</summary><div>
      {targets.map(target => <button key={target} className="af-target-link" onClick={() => onOpenTarget(target)}>Open {target} ↗</button>)}
    </div></details>}
  </>;
  return <div className="af-flow">
    <div className="af-flow-toolbar af-flow-toolbar-official" hidden={expanded}>
      <span className="af-flow-title"><Workflow size={16} aria-hidden="true" /><span>Salesforce Flow</span></span>
      <FlowViewControls onFit={() => setViewportVersion(v => v + 1)} onToggle={() => setExpanded(true)} />
    </div>
    {expanded ? <ExpandedFlow title={sourceLabel || visualization.fileName.replace(/\.flow-meta\.xml$/, '')} onClose={close} onFit={() => setViewportVersion(v => v + 1)}>{canvas}</ExpandedFlow> : canvas}
  </div>;
}

import type { ReactNode } from 'react';

/** Q4 Builder's fixed title band and drilldown navigation, shared by Studio tools. */
export function StudioToolHeader({ title, description, context, detail, onBack, disabled, actions }: {
  title: string; description: string; context?: ReactNode; detail?: string; onBack?(): void; disabled?: boolean; actions?: ReactNode;
}) {
  return <header className="sf-builder-header">
    <div className="sf-builder-header-text">
      {onBack && <button className="sf-builder-back" disabled={disabled} onClick={onBack}>← All {title.toLowerCase()}</button>}
      <h2 title={detail ?? title}>{detail ?? title}</h2>
      <p title={description}>{context ?? description}</p>
    </div>
    {actions && <div className="sf-builder-header-actions">{actions}</div>}
  </header>;
}

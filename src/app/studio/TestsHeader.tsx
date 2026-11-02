import { TestsHelp } from './TestsHelp.js';

export type TestsView = 'scenarios' | 'cases' | 'org' | 'simulations' | 'roleplay';
const VIEWS = [
  ['scenarios', 'Scenarios', 'Create reusable customer setups and starting variables.'],
  ['cases', 'Test cases', 'Replay saved scenarios and check expected outcomes for this agent.'],
  ['simulations', 'Batch simulations', 'Run multiple AI customer conversations across scenarios and repeats.'],
  ['roleplay', 'Role-play', 'Explore one AI customer conversation with its setup, chat and traces.']
] as const;

/** The same two rows stay mounted while the test workspace changes underneath. */
export function TestsHeader({ view, onViewChange, dirty, suite, casesOnly = false }: {
  view: TestsView; onViewChange(view: TestsView): void; dirty: boolean;
  suite?: { path: string; cases: readonly unknown[] } | null; casesOnly?: boolean;
}) {
  const label = suite ? `${suite.path} · ${suite.cases.length} case${suite.cases.length === 1 ? '' : 's'}` : '';
  return <header className="sf-tests-header" data-testid="tests-header">
    <style>{`
.sf-tests-header { display:flex; flex-direction:column; gap:8px; flex:none; min-width:0; }
.sf-tests-header .sf-tp-head { min-height:28px; flex-wrap:nowrap; }
.sf-tests-header h2 { flex:none; }
.sf-tests-header .sf-tp-sub { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sf-tests-nav { display:flex; align-items:center; gap:8px; flex-wrap:wrap; min-width:0; }
.sf-tests-nav .sf-tp-seg { min-width:0; }
.sf-tests-nav > .sf-tp-btn { min-height:30px; }
.sf-tp .sf-tp-seg button { outline:none; transition:background-color .12s,color .12s; }
.sf-tp .sf-tp-seg button:hover { background:var(--sf-sunken); color:var(--sf-text); }
.sf-tp .sf-tp-seg button[aria-pressed="true"] { background:var(--sf-soft); color:var(--sf-text); }
.sf-tp .sf-tp-seg button:focus-visible { outline:2px solid var(--sf-accent); outline-offset:-3px; border-radius:4px; }
.sf-tests-nav > .sf-tp-btn[aria-pressed="true"] { background:var(--sf-soft); color:var(--sf-text); }
@media (prefers-reduced-motion:reduce) { .sf-tp .sf-tp-seg button { transition:none; } }
    `}</style>
    <div className="sf-tp-head"><h2>Tests</h2><TestsHelp dirty={dirty} />{suite && <span className="sf-tp-sub" title={label}>{label}</span>}</div>
    {!casesOnly && <div className="sf-tests-nav">
      <div className="sf-tp-seg" role="group" aria-label="Tests view">
        {VIEWS.map(([key, name, title]) => <button key={key} type="button" title={title} aria-pressed={view === key} onClick={() => onViewChange(key)}>{name}</button>)}
      </div>
      <button className="sf-tp-btn" type="button" aria-pressed={view === 'org'} onClick={() => onViewChange('org')}>Browse tests</button>
    </div>}
  </header>;
}

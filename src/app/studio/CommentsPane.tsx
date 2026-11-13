import { useEffect, useRef, useState } from 'react';
import { STUDIO_LIMITS, type StudioComment } from '../../../lib/studio-contract.js';
import type { StudioAgentHandoff } from './agent-handoff.js';

/** Review comments for the open file: open/resolved tabs, jump to line, resolve with a note, edit, delete, hand off to the agent. */
export interface CommentsPaneProps {
  pluginId: string;
  projectId?: string;
  path: string | null;
  comments: StudioComment[];
  onReveal?(line: number): void;
  onResolve?(id: string, note: string): void;
  onEdit?(id: string, body: string): void;
  onDelete?(id: string): void;
  onAddressWithAgent?(): void | Promise<StudioAgentHandoff | void>;
}

const STYLES = `
.sf-cm { display: flex; flex-direction: column; gap: 8px; padding: 10px; color: var(--sf-text); font-size: 12px; min-height: 0; overflow: auto; }
.sf-cm-tabs { display: flex; gap: 4px; align-items: center; }
.sf-cm-tab, .sf-cm-btn { border: 1px solid var(--sf-border); background: transparent; color: var(--sf-text); border-radius: 6px; padding: 2px 8px; font: inherit; cursor: pointer; }
.sf-cm-tab[aria-selected="true"] { border-color: var(--sf-accent); color: var(--sf-accent); }
.sf-cm-btn.is-primary { border-color: var(--sf-accent); color: var(--sf-accent); }
.sf-cm-btn.is-danger { border-color: var(--sf-danger); color: var(--sf-danger); }
.sf-cm-btn:disabled { opacity: 0.5; cursor: default; }
.sf-cm-spacer { flex: 1; }
.sf-cm-card { border: 1px solid var(--sf-border); border-radius: 8px; padding: 8px; display: flex; flex-direction: column; gap: 4px; }
.sf-cm-card.is-resolved { opacity: 0.75; }
.sf-cm-meta { color: var(--sf-muted); display: flex; gap: 6px; align-items: center; }
.sf-cm-line { background: none; border: 0; color: var(--sf-accent); cursor: pointer; padding: 0; font: inherit; }
.sf-cm-quote { margin: 0; padding: 2px 6px; border-left: 2px solid var(--sf-border); color: var(--sf-muted); white-space: pre-wrap; font-family: ui-monospace, monospace; }
.sf-cm-body { white-space: pre-wrap; }
.sf-cm-note { color: var(--sf-success); }
.sf-cm-actions { display: flex; gap: 4px; }
.sf-cm-edit { width: 100%; box-sizing: border-box; min-height: 48px; resize: vertical; border: 1px solid var(--sf-border); background: transparent; color: var(--sf-text); border-radius: 6px; padding: 4px 6px; font: inherit; }
.sf-cm-input { flex: 1; min-width: 0; border: 1px solid var(--sf-border); background: transparent; color: var(--sf-text); border-radius: 6px; padding: 2px 6px; font: inherit; }
.sf-cm-empty { color: var(--sf-muted); padding: 12px 4px; }
.sf-cm-feedback { margin: 0; color: var(--sf-muted); }
.sf-cm-feedback[role=alert] { color: var(--sf-danger); }
`;

export function CommentsPane({ path, comments, onReveal, onResolve, onEdit, onDelete, onAddressWithAgent }: CommentsPaneProps) {
  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const [resolving, setResolving] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [addressing, setAddressing] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressStatus, setAddressStatus] = useState<string | null>(null);
  const addressAttempt = useRef(0);
  const addressPending = useRef(false);
  useEffect(() => {
    addressPending.current = false; setAddressing(false); setAddressError(null); setAddressStatus(null);
    return () => { addressAttempt.current++; addressPending.current = false; };
  }, [path]);
  const scoped = comments.filter(row => !path || row.path === path);
  const open = scoped.filter(row => !row.resolved);
  const resolved = scoped.filter(row => row.resolved);
  const shown = (tab === 'open' ? open : resolved).slice().sort((a, b) => a.line - b.line);
  const address = async () => {
    if (addressPending.current || !onAddressWithAgent || open.length === 0) return;
    const attempt = ++addressAttempt.current;
    addressPending.current = true; setAddressing(true); setAddressError(null); setAddressStatus(null);
    try {
      const result = await onAddressWithAgent();
      if (addressAttempt.current === attempt) setAddressStatus(result?.kind === 'draft' ? 'Request ready. Choose an agent and send it in the conversation panel.' : 'Agent conversation opened.');
    } catch (error) {
      if (addressAttempt.current === attempt) setAddressError(error instanceof Error ? error.message : String(error));
    } finally {
      if (addressAttempt.current === attempt) { addressPending.current = false; setAddressing(false); }
    }
  };
  const submit = (id: string) => {
    const text = note.trim();
    if (!text) return;
    onResolve?.(id, text);
    setResolving(null);
    setNote('');
  };
  const startEdit = (comment: StudioComment) => { setEditing(comment.id); setDraft(comment.body); setResolving(null); setDeleting(null); };
  const saveEdit = (comment: StudioComment) => {
    const text = draft.trim();
    if (!text) return;
    if (text !== comment.body.trim()) onEdit?.(comment.id, text);
    setEditing(null);
  };  return (
    <section className="sf-cm" aria-label="Review comments" data-testid="studio-comments-pane">
      <style>{STYLES}</style>
      <div className="sf-cm-tabs" role="tablist">
        <button type="button" role="tab" className="sf-cm-tab" aria-selected={tab === 'open'} onClick={() => setTab('open')}>Open ({open.length})</button>
        <button type="button" role="tab" className="sf-cm-tab" aria-selected={tab === 'resolved'} onClick={() => setTab('resolved')}>Resolved ({resolved.length})</button>
        <span className="sf-cm-spacer" />
        <button type="button" className="sf-cm-btn is-primary" disabled={addressing || open.length === 0 || !onAddressWithAgent} aria-busy={addressing} onClick={() => void address()}>{addressing ? 'Preparing…' : 'Address with agent'}</button>
      </div>
      {addressing && <p className="sf-cm-feedback" role="status">Preparing the agent request…</p>}
      {addressError && <p className="sf-cm-feedback" role="alert">{addressError}</p>}
      {addressStatus && <p className="sf-cm-feedback" role="status">{addressStatus}</p>}
      {shown.length === 0 && <div className="sf-cm-empty">{tab === 'open' ? 'No open comments. Click the editor gutter or select text to add one.' : 'Nothing resolved yet.'}</div>}
      {shown.map(comment => (
        <article key={comment.id} className={`sf-cm-card${comment.resolved ? ' is-resolved' : ''}`}>
          <div className="sf-cm-meta">
            <span>{comment.author.name}</span>
            {comment.editedAt && <span>(edited)</span>}
            <button type="button" className="sf-cm-line" onClick={() => onReveal?.(comment.line)} aria-label={`Jump to line ${comment.line}`}>
              {comment.endLine > comment.line ? `L${comment.line}-${comment.endLine}` : `L${comment.line}`}
            </button>
          </div>
          {comment.quote && <blockquote className="sf-cm-quote">{comment.quote.split('\n').slice(0, 3).join('\n')}</blockquote>}
          {editing === comment.id ? (
            <textarea className="sf-cm-edit" autoFocus aria-label="Edit comment" maxLength={STUDIO_LIMITS.commentBody} value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={event => { if (event.key === 'Escape') setEditing(null); if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) saveEdit(comment); }} />
          ) : <div className="sf-cm-body">{comment.body}</div>}
          {comment.resolved && <div className="sf-cm-note">Resolved by {comment.resolved.by}: {comment.resolved.note}</div>}
          {editing === comment.id && (
            <div className="sf-cm-actions">
              <button type="button" className="sf-cm-btn is-primary" disabled={!draft.trim()} onClick={() => saveEdit(comment)}>Save</button>
              <button type="button" className="sf-cm-btn" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          )}
          {deleting === comment.id && (
            <div className="sf-cm-actions">
              <span className="sf-cm-meta">Delete this comment?</span>
              <button type="button" className="sf-cm-btn is-danger" onClick={() => { setDeleting(null); onDelete?.(comment.id); }}>Delete</button>
              <button type="button" className="sf-cm-btn" onClick={() => setDeleting(null)}>Cancel</button>
            </div>
          )}
          {resolving !== comment.id && editing !== comment.id && deleting !== comment.id && (
            <div className="sf-cm-actions">
              {!comment.resolved && <button type="button" className="sf-cm-btn" onClick={() => { setResolving(comment.id); setNote(''); setEditing(null); }}>Resolve</button>}
              {!comment.resolved && comment.author.kind === 'user' && onEdit && <button type="button" className="sf-cm-btn" onClick={() => startEdit(comment)}>Edit</button>}
              {onDelete && <button type="button" className="sf-cm-btn" onClick={() => { setDeleting(comment.id); setEditing(null); }}>Delete</button>}
            </div>
          )}
          {resolving === comment.id && (
            <div className="sf-cm-actions">
              <input className="sf-cm-input" autoFocus aria-label="Resolution note" placeholder="What changed?" value={note}
                onChange={event => setNote(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') submit(comment.id); if (event.key === 'Escape') setResolving(null); }} />
              <button type="button" className="sf-cm-btn is-primary" disabled={!note.trim()} onClick={() => submit(comment.id)}>Resolve</button>
              <button type="button" className="sf-cm-btn" onClick={() => setResolving(null)}>Cancel</button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

/** Describe the saved evidence without confusing a short test with a complete journey. */
export function ConversationScope({ turns, plannedTurns, truncated = false }: {
  turns: ReadonlyArray<{ role: 'user' | 'agent' }>;
  plannedTurns: number;
  truncated?: boolean;
}) {
  if (!turns.length) return null;
  const customers = turns.filter(turn => turn.role === 'user').length;
  // A greeting before the opening customer message is not a reply to the test.
  const replies = turns.filter((turn, index) => turn.role === 'agent' && turns[index - 1]?.role === 'user').length;
  return <aside className="sf-conversation-scope" aria-label="Conversation coverage">
    <style>{`.sf-conversation-scope { padding:10px 12px; margin:12px 0; border:1px solid var(--sf-border); border-radius:7px; background:var(--sf-soft); font-size:11px; line-height:1.6; overflow-wrap:anywhere; }.sf-conversation-scope strong { display:block; color:var(--sf-text); }.sf-conversation-scope p { margin:4px 0 0; color:var(--sf-muted); }`}</style>
    <strong>{customers} of {plannedTurns} customer {plannedTurns === 1 ? 'turn' : 'turns'} · {replies} agent {replies === 1 ? 'reply' : 'replies'}</strong>
    <p>{truncated ? 'This saved recording was shortened. It does not show all the evidence used for this result.'
      : customers < plannedTurns || replies < customers ? 'The recording does not cover every configured customer turn and reply. Review the available evidence before relying on this result.'
      : customers === 1 ? 'One exchange only. This can verify a clarification or refusal; it does not establish completion of a longer journey. Add follow-up customer turns to test the rest.'
      : 'The verdict applies to the configured expectations across this recorded conversation. Simulated actions do not prove live business effects.'}</p>
  </aside>;
}

import { BUILDER_TOOL_CATALOG } from './builder-tool-catalog.js';

export const AGENT_SCRIPT_TOOLS = [
  { id: 'agents', title: 'Agents', description: 'Browse org agents and retrieve source versions', icon: 'M9 4h6 M12 2v2 M4 8h16v12H4z M8 12h.01 M16 12h.01 M8 16h8' },
  { id: 'files', title: 'File explorer', description: 'Project scripts and references', icon: 'M3 7h7l2 2h9v11H3z M3 7V4h7l2 3' },
  { id: 'graph', title: 'Graph view', description: 'Topics, actions, and conversation routes', icon: 'M6 3v6h12V3 M12 9v6 M9 15h6v6H9z' },
  { id: 'preview', title: 'Preview', description: 'Try the current draft in a conversation', icon: 'm8 4 12 8-12 8z' },
  { id: 'test', title: 'Tests', description: 'Open the full Evals workspace for scenarios, cases, and conversations', icon: 'M9 3h6 M10 3v7L4 20h16l-6-10V3 M7 16h10' },
  { id: 'actions', title: 'Actions', description: 'Inspect Apex, Flow, inputs, and outputs', icon: 'm8 6-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18' },
  { id: 'org-preview', title: 'Org preview', description: 'Talk to an agent in your connected org', icon: 'M7 18h11a4 4 0 0 0 0-8 6 6 0 0 0-11-3 5.5 5.5 0 0 0 0 11Z' },
  { id: 'comments', title: 'Comments', description: 'Review notes anchored to lines of this agent', icon: 'M4 4h16v12H8l-4 4z M8 9h8 M8 12h5' },
  { id: 'assistant', title: 'Assistant', description: 'Build with an assistant that sees your agent', icon: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z' },
  ...BUILDER_TOOL_CATALOG,
] as const;
export type AgentScriptTool = typeof AGENT_SCRIPT_TOOLS[number]['id'];

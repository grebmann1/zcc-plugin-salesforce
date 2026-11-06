export const BUILDER_TOOL_CATALOG = [
  { id: 'evals', title: 'Evals', description: 'Scenarios, test cases, batch simulations, role-play, and org tests', icon: 'M9 3h6M10 3v7L4 21h16l-6-11V3M7 16h10' },
  { id: 'sessions', title: 'Sessions', description: 'Search retained conversations and replay their traces', icon: 'M4 4h16v13H9l-5 4zM8 8h8M8 12h6' },
  { id: 'analytics', title: 'Analytics', description: 'Understand recorded outcomes, action usage, and latency', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
  { id: 'issues', title: 'Issues', description: 'Investigate diagnostics and failed evaluation evidence', icon: 'm12 3 10 18H2zM12 9v5M12 17v1' },
  { id: 'scorers', title: 'Scorers', description: 'Create reusable rules and score saved response evidence', icon: 'M4 5h16M4 12h16M4 19h16M8 2v6M16 9v6M10 16v6' },
  { id: 'experiments', title: 'Experiments', description: 'Compare saved source and draft against the same cases', icon: 'M6 3v12a4 4 0 0 0 4 4h8M6 7h9a3 3 0 0 0 3-3M3 3h6M15 18l4 1-4 3' },
  { id: 'compare', title: 'Compare', description: 'Review the saved source and current draft line by line', icon: 'M8 3v18M16 3v18M4 7l4-4 4 4M12 17l4 4 4-4' },
  { id: 'artifacts', title: 'Files', description: 'Keep plans, imported text files, and evaluation reports', icon: 'M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6' },
  { id: 'settings', title: 'Settings', description: 'Editor line numbers, wrapping, and assistant context', icon: 'M9 3h6l1 4 4 2v6l-4 2-1 4H9l-1-4-4-2V9l4-2zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6' },
  { id: 'import', title: 'Tool shortcuts', description: 'Import named shortcuts to existing Studio tools', icon: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5' },
] as const;

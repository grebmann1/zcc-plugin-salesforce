import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentDraftSource, createAgentDraft, draftDestination, DRAFT_METADATA } from '../lib/agent-drafts.js';
import { suggestedAgentName } from '../lib/agent-draft-contract.js';
import { parseAgentScriptSource } from '../lib/agent-script-parse.js';
const roots: string[] = [];
const root = () => { const path = mkdtempSync(join(tmpdir(), 'sf-draft-')); roots.push(path); return path; };
const input = { name: 'Support & help', apiName: 'Support', purpose: 'Be helpful.\n"Quote" < & >' };
afterEach(() => { roots.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })); });

describe('local agent creation', () => {
  it('creates a paired valid draft in a managed DX child without an org or root config', () => {
    const project = root();
    expect(draftDestination(project)).toMatchObject({ initializesProject: true, directory: 'agentforce-drafts/force-app/main/default/aiAuthoringBundles' });
    const file = createAgentDraft(project, input);
    expect(file.projectRoot).toBe('agentforce-drafts');
    expect(existsSync(join(project, 'sfdx-project.json'))).toBe(false);
    expect(readFileSync(join(project, file.metadataPath), 'utf8')).toBe(DRAFT_METADATA);
    const source = readFileSync(join(project, file.path), 'utf8');
    expect(parseAgentScriptSource(source, 'agentforce').hasErrors).toBe(false);
    expect(file.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(draftDestination(project).initializesProject).toBe(false);
    expect(() => createAgentDraft(project, input)).toThrow('already exists');
    expect(readFileSync(join(project, file.path), 'utf8')).toBe(source);
    expect(readdirSync(join(project, 'agentforce-drafts/force-app/main/default/aiAuthoringBundles'))).toEqual(['Support']);
    createAgentDraft(project, { name: 'Next', apiName: 'Next' });
  });
  it('uses the declared default package and escapes all free text', () => {
    const project = root(); writeFileSync(join(project, 'sfdx-project.json'), JSON.stringify({ packageDirectories: [{ path: 'one' }, { path: 'packages/two', default: true }] }));
    const file = createAgentDraft(project, input);
    expect(file.path).toBe('packages/two/main/default/aiAuthoringBundles/Support/Support.agent');
    expect(file.projectRoot).toBe('.');
    expect(agentDraftSource(input)).toContain(JSON.stringify(input.purpose));
    expect(suggestedAgentName('123 Élite service !!')).toBe('Elite_service');
  });
  it('copies source into a new unversioned identity without inherited metadata', () => {
    const source = agentDraftSource(input);
    const file = createAgentDraft(root(), { ...input, apiName: 'Copy', source });
    expect(file.apiName).toBe('Copy');
    expect(agentDraftSource({ ...input, apiName: 'Copy', source })).toContain('agent_name: "Copy"');
    expect(() => agentDraftSource({ ...input, source: 'missing config' })).toThrow('agent_name');
  });
  it('copies a GuiAgentReview-shaped current source by its config developer_name only', () => {
    const source = `system:
  instructions: |
    You are GuiAgentReview, an assistant for BTnet quoting.
    Example only:
      agent_name: "Do_Not_Replace"
      developer_name: "Also_Not_Identity"
  messages:
    welcome: |
      Hi! I can help with BTnet quotes, setup, pricing and orders.

config:
  agent_label: "GuiAgentReview"
  agent_type: "AgentforceEmployeeAgent"
  description: "Deliver personalized customer experiences."
  developer_name: "GuiAgentReview" # retain identity comment

variables:
  accountId: mutable string
    visibility: "External"
    description: ""
`;
    expect(agentDraftSource({ ...input, apiName: 'Copy', source })).toBe(source.replace('developer_name: "GuiAgentReview"', 'developer_name: "Copy"'));
  });
  it.each(['developer_name', 'agent_name'])('preserves %s dialect, whitespace, comments, Unicode and CRLF', key => {
    const source = `# Welcome 👋 é\r\n# @dialect:agentforce\r\nconfig:\r\n  ${key}:   "Original"  # keep this\r\n`;
    expect(agentDraftSource({ ...input, apiName: 'Copy', source })).toBe(source.replace('"Original"', '"Copy"'));
  });
  it('never treats identity-shaped instructions as config or changes files on rejected copies', () => {
    const project = root();
    const source = 'system:\n    instructions: |\n        config:\n            agent_name: "Instruction_Only"\n            developer_name: "Also_Instruction"\n';
    expect(() => createAgentDraft(project, { ...input, source })).toThrow('config.developer_name');
    expect(readdirSync(project)).toEqual([]);
    expect(() => agentDraftSource({ ...input, source: source + '\nconfig:\n    agent_label: "No identity"\n' })).toThrow('unambiguous');
  });
  it('limits identity ambiguity checks to config while preserving unrelated diagnostics for later review', () => {
    const source = 'config:\n  developer_name: "Original"\nsystem:\n  developer_name: "One"\n  developer_name: "Two"\n';
    expect(parseAgentScriptSource(source, 'agentforce').diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'duplicate-key' })]));
    expect(agentDraftSource({ ...input, apiName: 'Copy', source })).toBe(source.replace('"Original"', '"Copy"'));
  });
  it.each([
    'config:\n    developer_name: "One"\n    agent_name: "Two"\n',
    'config:\n    developer_name: "One"\n    agent_name: "One"\n',
    'config:\n    developer_name: "One"\n    developer_name: "Two"\n',
    'config:\n    agent_name: "One"\n    agent_name: "Two"\n',
    'config:\n    developer_name: "One"\nconfig:\n    developer_name: "Two"\n',
    'config:\n    agent_name: "One"\nconfig:\n    agent_name: "Two"\n',
    'config:\n    developer_name: "One"\nconfig:\n    agent_label: "Other"\n',
    'config:\n    developer_name: ""\n',
    'config:\n    developer_name: 42\n',
    'config:\n    agent_name: Unquoted\n',
    'config:\n    developer_name: |\n        Template_Identity\n',
    'config:\n    developer_name: "invalid-name"\n'
  ])('rejects ambiguous or invalid config identity: %s', source => {
    expect(() => agentDraftSource({ ...input, source })).toThrow('unambiguous');
  });
  it('creates fresh target-free metadata and leaves a versioned original source and metadata intact', () => {
    const project = root();
    writeFileSync(join(project, 'sfdx-project.json'), JSON.stringify({ packageDirectories: [{ path: 'force-app', default: true }] }));
    const original = join(project, 'force-app/main/default/aiAuthoringBundles/GuiAgentReview_1');
    mkdirSync(original, { recursive: true });
    const source = 'config:\n  developer_name: "GuiAgentReview"\n  agent_label: "GuiAgentReview"\n';
    const metadata = DRAFT_METADATA.replace('  <bundleType>', '  <target>GuiAgentReview.v20</target>\n  <bundleType>');
    writeFileSync(join(original, 'GuiAgentReview_1.agent'), source);
    writeFileSync(join(original, 'GuiAgentReview_1.bundle-meta.xml'), metadata);
    const created = createAgentDraft(project, { ...input, apiName: 'Copy', source });
    expect(readFileSync(join(project, created.path), 'utf8')).toBe(source.replace('developer_name: "GuiAgentReview"', 'developer_name: "Copy"'));
    expect(readFileSync(join(project, created.metadataPath), 'utf8')).toBe(DRAFT_METADATA);
    expect(readFileSync(join(original, 'GuiAgentReview_1.agent'), 'utf8')).toBe(source);
    expect(readFileSync(join(original, 'GuiAgentReview_1.bundle-meta.xml'), 'utf8')).toBe(metadata);
  });
  it.each(['../Outside', '/absolute', 'bad__name', 'bad_', '1Bad', 'bad-name', '', 'a'.repeat(81)])('rejects unsafe API name %s without writes', apiName => {
    const project = root(); expect(() => createAgentDraft(project, { ...input, apiName })).toThrow('API name'); expect(readdirSync(project)).toEqual([]);
  });
  it('bounds input and refuses invalid project/configuration', () => {
    expect(() => agentDraftSource({ ...input, name: '' })).toThrow('name');
    expect(() => agentDraftSource({ ...input, name: 'a\nb' })).toThrow('name');
    expect(() => agentDraftSource({ ...input, purpose: 'a'.repeat(4001) })).toThrow('Purpose');
    expect(() => agentDraftSource({ ...input, source: '' })).toThrow('source');
    const project = root(); writeFileSync(join(project, 'file'), 'x');
    expect(() => draftDestination(join(project, 'file'))).toThrow('local project');
    writeFileSync(join(project, 'sfdx-project.json'), '{"packageDirectories":[]}');
    expect(() => draftDestination(project)).toThrow('no package');
    writeFileSync(join(project, 'sfdx-project.json'), '{"packageDirectories":[{}]}');
    expect(() => draftDestination(project)).toThrow('Invalid');
  });
  it.each(['../escape', '/tmp/outside', 'a/../../b', 'a\\b', 'C:/outside', '.'])('refuses unconfined package %s', path => {
    const project = root(); writeFileSync(join(project, 'sfdx-project.json'), JSON.stringify({ packageDirectories: [{ path }] }));
    expect(() => createAgentDraft(project, input)).toThrow('inside');
  });
  it('refuses symlinked project, package, manifest and destination entries', () => {
    const outside = root(); const project = root();
    symlinkSync(outside, join(project, 'agentforce-drafts'));
    expect(() => createAgentDraft(project, input)).toThrow('symbolic');
    rmSync(join(project, 'agentforce-drafts')); writeFileSync(join(outside, 'manifest'), '{"packageDirectories":[{"path":"force-app"}]}');
    symlinkSync(join(outside, 'manifest'), join(project, 'sfdx-project.json'));
    expect(() => draftDestination(project)).toThrow('configuration');
    rmSync(join(project, 'sfdx-project.json')); writeFileSync(join(project, 'sfdx-project.json'), '{"packageDirectories":[{"path":"force-app"}]}');
    symlinkSync(outside, join(project, 'force-app'));
    expect(() => createAgentDraft(project, input)).toThrow('symbolic');
    rmSync(join(project, 'force-app')); mkdirSync(join(project, 'force-app/main/default/aiAuthoringBundles'), { recursive: true });
    symlinkSync(outside, join(project, 'force-app/main/default/aiAuthoringBundles/Support'));
    expect(() => createAgentDraft(project, input)).toThrow('already exists');
    expect(readdirSync(outside)).toEqual(['manifest']);
  });
});

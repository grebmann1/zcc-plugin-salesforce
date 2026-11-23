import { describe, expect, it } from 'vitest';
import { Guardrail, confirms, envelopeTitle, sessionKey } from '../lib/guardrail.js';

describe('guardrail', () => {
  it('runs reads without a prompt on every org kind, even headless', async () => {
    const guard = new Guardrail(async () => {
      throw new Error('should not prompt');
    });
    for (const orgKind of ['production', 'unknown', 'sandbox', 'scratch'] as const) {
      for (const threadId of ['t1', '']) {
        await expect(guard.mediate({ threadId, orgAlias: 'org', orgKind, summary: 'read' })).resolves.toEqual({ approved: true, reason: 'submitted' });
        for (const kind of ['org.production.read', 'org.unknown.read', 'soql.unbounded'] as const) {
          await expect(guard.mediate({ threadId, orgAlias: 'org', orgKind, kind, summary: 'read' })).resolves.toEqual({ approved: true, reason: 'submitted' });
        }
      }
    }
    expect(confirms('soql.unbounded')).toBe(false);
    expect(confirms('soql.export')).toBe(true);
  });

  it('fails closed without a thread id for anything that confirms', async () => {
    const guard = new Guardrail(async () => {
      throw new Error('should not prompt');
    });
    for (const kind of ['org.write', 'apex.anonymous', 'soql.export', 'agent.publish'] as const) {
      await expect(guard.mediate({ threadId: '', orgAlias: 'prod', orgKind: 'production', kind, summary: 'x' })).resolves.toEqual({ approved: false, reason: 'headless' });
    }
  });

  it('reuses a session approval for an export of the same query', async () => {
    let prompts = 0;
    const guard = new Guardrail(async () => {
      prompts += 1;
      return { approved: true, reason: 'submitted' };
    });
    const request = { threadId: 't1', orgAlias: 'prod', orgId: '00Dxx', orgKind: 'production' as const, kind: 'soql.export' as const, fingerprint: 'q', summary: 'export' };
    await expect(guard.mediate(request)).resolves.toMatchObject({ approved: true });
    await expect(guard.mediate(request)).resolves.toMatchObject({ approved: true });
    expect(prompts).toBe(1);
    guard.clearThread('t1');
    await guard.mediate(request);
    expect(prompts).toBe(2);
    expect(sessionKey('t1', { kind: 'soql.export', orgAlias: 'prod', orgId: '00Dxx', orgKind: 'production', summary: '' })).toContain('soql.export');
  });

  it('confirms model compute once per thread on production and unknown orgs only', async () => {
    let prompts = 0;
    const guard = new Guardrail(async () => {
      prompts += 1;
      return { approved: true, reason: 'submitted' };
    });
    const run = (orgKind: 'production' | 'unknown' | 'sandbox' | 'scratch', threadId = 't1') =>
      guard.mediate({ threadId, orgAlias: 'org', orgId: `00D-${orgKind}`, orgKind, kind: 'org.compute', summary: 'eval' });
    await run('sandbox');
    await run('scratch');
    expect(prompts).toBe(0);
    await run('production');
    await run('production');
    await run('unknown');
    expect(prompts).toBe(2);
    await expect(run('production', '')).resolves.toEqual({ approved: false, reason: 'headless' });
    expect(envelopeTitle('org.compute')).toBe('Confirm Agentforce run');
  });

  it('always prompts Agentforce publish, activate, live preview, and org.write', async () => {
    let prompts = 0;
    const guard = new Guardrail(async () => {
      prompts += 1;
      return { approved: true, reason: 'submitted' };
    });
    const publish = {
      threadId: 't1',
      orgAlias: 'dev',
      orgId: '00D',
      orgKind: 'sandbox' as const,
      kind: 'agent.publish' as const,
      summary: 'publish'
    };
    await expect(guard.mediate(publish)).resolves.toMatchObject({ approved: true });
    await expect(guard.mediate(publish)).resolves.toMatchObject({ approved: true });
    await expect(
      guard.mediate({ ...publish, kind: 'agent.activate', summary: 'activate' })
    ).resolves.toMatchObject({ approved: true });
    await expect(
      guard.mediate({ ...publish, kind: 'agent.preview.live', summary: 'live preview' })
    ).resolves.toMatchObject({ approved: true });
    await expect(
      guard.mediate({ ...publish, kind: 'org.write', summary: 'PATCH Account' })
    ).resolves.toMatchObject({ approved: true });
    await expect(
      guard.mediate({ ...publish, kind: 'org.write', summary: 'PATCH Account' })
    ).resolves.toMatchObject({ approved: true });
    // Deactivate asks every time too: an earlier yes never takes another agent offline.
    await expect(guard.mediate({ ...publish, kind: 'agent.deactivate', summary: 'deactivate' })).resolves.toMatchObject({ approved: true });
    await expect(guard.mediate({ ...publish, kind: 'agent.deactivate', summary: 'deactivate' })).resolves.toMatchObject({ approved: true });
    expect(prompts).toBe(8);
  });

  it('names every guardrail envelope', () => {
    expect(envelopeTitle('org.production.read')).toMatch(/production/);
    expect(envelopeTitle('org.unknown.read')).toMatch(/unknown/);
    expect(envelopeTitle('org.write')).toMatch(/Salesforce write/);
    expect(envelopeTitle('soql.unbounded')).toMatch(/unbounded/);
    expect(envelopeTitle('soql.export')).toMatch(/export/);
    expect(envelopeTitle('apex.anonymous')).toMatch(/anonymous/);
    expect(envelopeTitle('agent.publish')).toMatch(/publish/);
    expect(envelopeTitle('agent.activate')).toMatch(/activate/);
    expect(envelopeTitle('agent.deactivate')).toBe('Confirm Agentforce deactivate');
    expect(envelopeTitle('agent.preview.live')).toMatch(/live preview/);
    expect(envelopeTitle('not-a-kind' as 'soql.export')).toMatch(/Salesforce/);
  });

  it('treats cancel as refusal', async () => {
    const guard = new Guardrail(async () => ({ approved: false, reason: 'cancelled' }));
    await expect(
      guard.mediate({
        threadId: 't1',
        orgAlias: 'prod',
        orgKind: 'unknown',
        kind: 'apex.anonymous',
        summary: 'anon'
      })
    ).resolves.toEqual({ approved: false, reason: 'cancelled' });
  });
});

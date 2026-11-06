/** @vitest-environment happy-dom */
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readComparisonHandle, writeComparisonHandle, forgetComparisonHandle } from './comparison-recovery.js';
const prefix = 'salesforce:comparison-handle:v1:';
const handle = () => ({ jobId: 'owned-job', suiteId: 'suite', suitePath: 'tests/a.json', at: Date.now() });
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
it('round trips only an owned pointer, excluding sources and response evidence', () => {
  const value = { ...handle(), source: 'secret script', conversation: 'secret reply' };
  writeComparisonHandle('scope', value);
  expect(readComparisonHandle('scope')).toEqual({ jobId: value.jobId, suiteId: value.suiteId, suitePath: value.suitePath, at: value.at });
  expect(localStorage.getItem(prefix + 'scope')).not.toMatch(/secret|source|conversation/);
  expect(readComparisonHandle('other')).toBeNull();
  forgetComparisonHandle('scope'); expect(readComparisonHandle('scope')).toBeNull();
});
it('rejects malformed, old, future, oversized and unowned job handles', () => {
  for (const value of ['{bad', 'null', '[]', JSON.stringify({ ...handle(), jobId: '../other' }), JSON.stringify({ ...handle(), at: 0 }), JSON.stringify({ ...handle(), at: Date.now() + 60000 }), JSON.stringify({ ...handle(), suiteId: 1 }), JSON.stringify({ ...handle(), suitePath: 1 }), JSON.stringify({ ...handle(), suiteId: 'x'.repeat(121) }), JSON.stringify({ ...handle(), suitePath: 'x'.repeat(4097) }), 'x'.repeat(6001)]) {
    localStorage.setItem(prefix + 'scope', value); expect(readComparisonHandle('scope')).toBeNull();
  }
});
it('bounds storage to 32 handles and prunes corrupt and expired rows', () => {
  localStorage.setItem('unrelated', 'keep'); localStorage.setItem(prefix + 'bad', '{broken');
  localStorage.setItem(prefix + 'old', JSON.stringify({ ...handle(), at: 1 }));
  for (let index = 0; index < 40; index++) writeComparisonHandle(String(index), { ...handle(), at: Date.now() - 1000 + index });
  expect(localStorage.length).toBe(33); expect(localStorage.getItem('unrelated')).toBe('keep');
  expect(readComparisonHandle('bad')).toBeNull(); expect(readComparisonHandle('old')).toBeNull(); expect(readComparisonHandle('0')).toBeNull();
  writeComparisonHandle('39', handle()); expect(localStorage.length).toBe(33);
});
it('keeps runs usable when storage is unavailable or full', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('unavailable'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('full'); });
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw Error('unavailable'); });
  expect(readComparisonHandle('scope')).toBeNull();
  expect(() => writeComparisonHandle('scope', handle())).not.toThrow();
  expect(() => forgetComparisonHandle('scope')).not.toThrow();
});

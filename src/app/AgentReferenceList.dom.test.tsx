/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentReferenceRow, AgentReferenceSearch } from './AgentReferenceList.js';

afterEach(cleanup);
describe('shared agent reference list', () => {
  it('keeps the technical reference, metadata, selection and native button navigation together', () => {
    const onClick = vi.fn();
    const props = { icon: <svg />, kind: 'apex', name: 'Find orders', reference: 'apex://OrderLookup', meta: 'Apex', onClick };
    const view = render(<AgentReferenceRow {...props} active data-ref="lookup" title="Order lookup" className="test-row" />);
    const row = screen.getByRole('button', { name: 'Find orders apex://OrderLookup Apex' });
    expect(row.getAttribute('type')).toBe('button');
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(row.dataset.ref).toBe('lookup');
    expect(row.classList.contains('test-row')).toBe(true);
    expect(row.querySelector('.sf-reference-icon')?.getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledOnce();
    view.rerender(<AgentReferenceRow {...props} />);
    expect(row.hasAttribute('aria-current')).toBe(false);
    expect(row.classList.contains('is-active')).toBe(false);
  });
  it('exposes a labelled searchbox and forwards the query', () => {
    const onChange = vi.fn();
    render(<AgentReferenceSearch label="Search references" placeholder="Search names or targets…" value="" onChange={onChange} />);
    const input = screen.getByRole('searchbox', { name: 'Search references' });
    fireEvent.change(input, { target: { value: 'order' } });
    expect(onChange).toHaveBeenCalledWith('order');
    expect(input.getAttribute('placeholder')).toBe('Search names or targets…');
  });
});

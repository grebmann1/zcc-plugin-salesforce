/** @vitest-environment happy-dom */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SalesforcePicklist, containsPicklistTarget } from './SalesforcePicklist.js';
import { OrgSwitcher } from './ui.js';

afterEach(cleanup);
const options = [{ value: '', label: 'Agent defaults' }, { value: 'one', label: 'Happy path · revision 1' }, { value: 'two', label: 'Missing details · revision 2' }, { value: 'disabled', label: 'Unavailable', disabled: true }];
function Harness({ searchable = false }: { searchable?: boolean }) {
  const [value, setValue] = useState('');
  return <SalesforcePicklist ariaLabel="Shared scenario" value={value} onChange={setValue} options={options} searchable={searchable} searchPlaceholder="Search scenarios…" />;
}
it('portals the menu out of its scrolling container, selects a revision and returns focus', async () => {
  const { container } = render(<div style={{ overflow: 'hidden' }}><Harness /></div>);
  const trigger = screen.getByRole('button', { name: 'Shared scenario' });
  fireEvent.click(trigger);
  const menu = screen.getByRole('listbox', { name: 'Shared scenario' });
  expect(container.contains(menu)).toBe(false);
  expect(menu.parentElement).toBe(document.body);
  fireEvent.click(within(menu).getByRole('option', { name: 'Happy path · revision 1' }));
  expect(trigger.textContent).toBe('Happy path · revision 1');
  expect(screen.queryByRole('listbox')).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
it('moves one row per key in a searchable menu, skipping disabled choices', async () => {
  render(<Harness searchable />);
  const trigger = screen.getByRole('button', { name: 'Shared scenario' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const search = screen.getByRole('textbox', { name: 'Search scenarios…' });
  await waitFor(() => expect(document.activeElement).toBe(search));
  fireEvent.keyDown(search, { key: 'ArrowDown' }); fireEvent.keyDown(search, { key: 'Enter' });
  expect(trigger.textContent).toBe('Happy path · revision 1');
  fireEvent.click(trigger); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'End' }); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(trigger.textContent).toBe('Missing details · revision 2');
});
it('filters longer lists and keeps Escape inside the picker rather than closing its parent', () => {
  const parentEscape = vi.fn();
  render(<div onKeyDown={parentEscape}><Harness searchable /></div>);
  const trigger = screen.getByRole('button', { name: 'Shared scenario' });
  fireEvent.click(trigger);
  const search = screen.getByRole('textbox');
  fireEvent.change(search, { target: { value: 'revision 2' } });
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.change(search, { target: { value: 'no match' } }); expect(screen.getByText('No matches')).toBeTruthy();
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(parentEscape).not.toHaveBeenCalled(); expect(screen.queryByRole('listbox')).toBeNull();
});
it('keeps validation, help text, blur tracking and the field label on the focusable trigger', () => {
  const blur = vi.fn();
  render(<><label htmlFor="boolean">Verified</label><p id="help">Use the customer verification state.</p><SalesforcePicklist id="boolean" ariaLabel="Verified value" triggerTestId="verified" triggerClassName="special" value="false" searchable={false} onChange={vi.fn()} options={[{ value: 'false', label: 'False' }]} triggerProps={{ 'aria-invalid': true, 'aria-describedby': 'help', 'data-context-name': 'verified', onBlur: blur }} /></>);
  const trigger = screen.getByRole('button', { name: 'Verified value' });
  expect(screen.getByLabelText('Verified')).toBe(trigger);
  expect(trigger.getAttribute('aria-invalid')).toBe('true'); expect(trigger.getAttribute('aria-describedby')).toBe('help');
  expect(trigger.dataset.contextName).toBe('verified'); expect(trigger.dataset.testid).toBe('verified'); expect(trigger.className).toContain('special');
  fireEvent.blur(trigger); expect(blur).toHaveBeenCalledOnce();
});
it('cannot open disabled controls', () => {
  render(<SalesforcePicklist ariaLabel="Engine" value="one" onChange={vi.fn()} options={options} disabled />);
  fireEvent.click(screen.getByRole('button', { name: 'Engine' })); expect(screen.queryByRole('listbox')).toBeNull();
});
it('keeps portaled settings choices inside their owner for outside-click and focus handling', () => {
  const { container } = render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Shared scenario' });
  expect(containsPicklistTarget(container, trigger)).toBe(true);
  expect(containsPicklistTarget(container, null)).toBe(false);
  expect(containsPicklistTarget(container, document.body)).toBe(false);
  fireEvent.click(trigger);
  const option = screen.getByRole('option', { name: 'Happy path · revision 1' });
  expect(containsPicklistTarget(container, option)).toBe(true);
  expect(containsPicklistTarget(container, new EventTarget())).toBe(false);
});
it('closes an open menu when the control becomes busy', () => {
  const change = vi.fn();
  const { rerender } = render(<SalesforcePicklist ariaLabel="Engine" value="one" onChange={change} options={options} />);
  fireEvent.click(screen.getByRole('button', { name: 'Engine' }));
  rerender(<SalesforcePicklist ariaLabel="Engine" value="one" onChange={change} options={options} disabled />);
  expect(screen.queryByRole('listbox')).toBeNull(); expect(change).not.toHaveBeenCalled();
});
it('honors an inherited disabled fieldset even though its menu lives outside it', () => {
  const change = vi.fn();
  const { rerender } = render(<fieldset><SalesforcePicklist ariaLabel="Engine" value="one" onChange={change} options={options} /></fieldset>);
  fireEvent.click(screen.getByRole('button', { name: 'Engine' }));
  rerender(<fieldset disabled><SalesforcePicklist ariaLabel="Engine" value="one" onChange={change} options={options} /></fieldset>);
  fireEvent.click(screen.getByRole('option', { name: 'Missing details · revision 2' }));
  expect(change).not.toHaveBeenCalled();
});
it('keeps the native first-legend exception available in a disabled fieldset', () => {
  const change = vi.fn();
  render(<fieldset disabled><legend><SalesforcePicklist ariaLabel="Engine" value="one" onChange={change} options={options} /></legend></fieldset>);
  fireEvent.click(screen.getByRole('button', { name: 'Engine' }));
  fireEvent.click(screen.getByRole('option', { name: 'Missing details · revision 2' }));
  expect(change).toHaveBeenCalledWith('two');
});
it('closes on Tab and lets the form keep its next focus target', () => {
  render(<><Harness /><input aria-label="Next field" /></>);
  fireEvent.click(screen.getByRole('button', { name: 'Shared scenario' }));
  fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Tab' });
  const next = screen.getByRole('textbox', { name: 'Next field' }); next.focus();
  expect(screen.queryByRole('listbox')).toBeNull(); expect(document.activeElement).toBe(next);
});
it('keeps unknown orgs visible and lists connected orgs without changing the target on open', () => {
  const change = vi.fn();
  render(<OrgSwitcher orgs={[{ alias: 'dev', username: 'u@example.com', kind: 'sandbox' } as any]} value="missing" onChange={change} />);
  const trigger = screen.getByRole('button', { name: 'Salesforce org' }); expect(trigger.textContent).toBe('missing (not in connected list)');
  fireEvent.click(trigger); expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('option', { name: 'dev (sandbox)' })); expect(change).toHaveBeenCalledWith('dev');
});
it('handles an empty org list and a connected username without an alias', () => {
  const { rerender } = render(<OrgSwitcher orgs={[]} value="" onChange={vi.fn()} />);
  expect((screen.getByRole('button', { name: 'Salesforce org' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('No connected orgs')).toBeTruthy();
  rerender(<OrgSwitcher orgs={[{ username: 'u@example.com', kind: 'sandbox' } as any]} value="" onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Salesforce org' })); expect(screen.getByRole('option', { name: 'u@example.com (sandbox)' })).toBeTruthy();
});

import { flushSync } from 'react-dom';
import { fireEvent, within, waitFor } from '@testing-library/react';

/** Exercise the actual portaled menu, selecting the requested value. */
export function choosePicklistValue(trigger: HTMLElement, value: string) {
  flushSync(() => fireEvent.click(trigger));
  const menu = trigger.ownerDocument.getElementById(trigger.getAttribute('aria-controls')!);
  if (!menu) throw Error(`Picklist ${trigger.getAttribute('aria-label')} did not open`);
  const option = within(menu).getAllByRole('option').find(row => row.id === `${menu.id}-${value}`);
  if (!option) throw Error(`No option ${value} in ${trigger.getAttribute('aria-label')}`);
  flushSync(() => fireEvent.click(option));
}

export async function findPicklistOption(trigger: HTMLElement, name: string) {
  await waitFor(() => { if (trigger.matches(':disabled')) throw Error('Picker is loading'); });
  flushSync(() => fireEvent.click(trigger));
  const menu = trigger.ownerDocument.getElementById(trigger.getAttribute('aria-controls')!)!;
  const option = await within(menu).findByRole('option', { name });
  flushSync(() => fireEvent.click(trigger));
  return option;
}

export function picklistOption(trigger: HTMLElement, name: string) {
  flushSync(() => fireEvent.click(trigger));
  const menu = trigger.ownerDocument.getElementById(trigger.getAttribute('aria-controls')!)!;
  const option = within(menu).getByRole('option', { name });
  flushSync(() => fireEvent.click(trigger));
  return option;
}

export function choosePicklistLabel(trigger: HTMLElement, name: string) {
  flushSync(() => fireEvent.click(trigger));
  const menu = trigger.ownerDocument.getElementById(trigger.getAttribute('aria-controls')!)!;
  fireEvent.click(within(menu).getByRole('option', { name }));
}

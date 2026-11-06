import type { Locator } from '@playwright/test';

/** Select through the actual themed menu rather than the removed OS control. */
export async function selectPicklistValue(trigger: Locator, choice: string | { label: string }) {
  await trigger.click();
  const menuId = await trigger.getAttribute('aria-controls');
  const menu = trigger.page().getByRole('listbox', { name: (await trigger.getAttribute('aria-label'))!, exact: true });
  await menu.waitFor({ state: 'visible' });
  if (typeof choice === 'object') await menu.getByRole('option', { name: choice.label, exact: true }).click();
  else {
    const index = await menu.getByRole('option').evaluateAll((options, id) => options.findIndex(option => option.id === id), `${menuId}-${choice}`);
    if (index < 0) throw Error(`Choice ${choice} not found in ${await trigger.getAttribute('aria-label')}`);
    await menu.getByRole('option').nth(index).click();
  }
  await menu.waitFor({ state: 'hidden' });
}

export async function readPicklistValue(trigger: Locator): Promise<string> {
  await trigger.click();
  const menuId = (await trigger.getAttribute('aria-controls'))!;
  const menu = trigger.page().getByRole('listbox', { name: (await trigger.getAttribute('aria-label'))!, exact: true });
  const id = await menu.getByRole('option', { selected: true }).getAttribute('id');
  if (!id?.startsWith(`${menuId}-`)) throw Error('Selected picklist option is missing');
  await menu.press('Escape'); await menu.waitFor({ state: 'hidden' });
  return id.slice(menuId.length + 1);
}

export async function expectPicklistValue(trigger: Locator, value: string) {
  const selected = await readPicklistValue(trigger);
  if (selected !== value) throw Error(`Expected ${value} in ${await trigger.getAttribute('aria-label')}, got ${selected}`);
}

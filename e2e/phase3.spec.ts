import { expect, test } from '@playwright/test'

test('crea un mes, agrega un gasto fijo y mantiene el saldo al pagarlo', async ({ page }) => {
  await page.goto('/crear')
  await page.getByLabel('Password', { exact: true }).fill('phase3-password')
  await page.getByLabel('Confirm password').fill('phase3-password')
  await page.getByRole('button', { name: 'Create vault' }).click()
  await expect(page.getByRole('heading', { name: 'Your file is ready.' })).toBeVisible()

  await page.getByRole('button', { name: 'New month' }).click()
  await page.getByLabel('Amount (ARS)').fill('1000')
  await page.getByRole('button', { name: 'Create month' }).click()
  await expect(page.getByText('Pending fixed expenses')).toBeVisible()

  await page.getByRole('button', { name: 'New fixed expense' }).click()
  await page.getByLabel('Concept').fill('Alquiler')
  await page.getByLabel('Amount (ARS)').fill('250')
  await page.getByRole('button', { name: 'Save fixed expense' }).click()
  await expect(page.getByText('Alquiler')).toBeVisible()
  await expect(page.getByRole('cell', { name: /250\.00/ })).toBeVisible()
  const summary = page.getByRole('region', { name: 'Monthly summary' })
  const pendingDebt = summary.locator('.summary-cell').filter({ hasText: 'Pending fixed expenses' })
  const balance = summary.locator('.summary-cell').filter({ hasText: 'Balance' })
  await expect(pendingDebt).toContainText('250.00')
  await expect(balance).toContainText('750.00')

  await page.getByRole('button', { name: 'Mark as paid' }).click()
  await expect(page.getByText('Paid')).toBeVisible()
  await expect(pendingDebt).toContainText('0.00')
  await expect(balance).toContainText('750.00')
  await expect(summary.getByText(/^\$\s*750\.00$/)).toHaveCount(1)
  await expect(summary).not.toContainText('Real balance')
  await expect(summary).not.toContainText('Available balance')
})

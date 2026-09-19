import { expect, test } from '@playwright/test'

test('landing page offers the current file actions', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Your money, on a clear sheet.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Create file' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open file' }).first()).toBeVisible()
  await expect(page.getByText('Your data stays local')).toBeVisible()
  await expect(page.getByText('Nimvo · V2')).toBeVisible()
  await expect(page.getByText('Phase 2')).toHaveCount(0)
})

test('preferences menu updates and persists the selected theme', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Preferences' }).click()
  const toggle = page.getByRole('button', { name: 'Dark' })

  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Preferences' }).click()
  await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
})

test('preferences persist Spanish and an independent number format', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Preferences' }).click()
  await page.getByRole('dialog', { name: 'Preferences' }).getByRole('button', { name: 'ES', exact: true }).click()
  await page.getByRole('button', { name: 'Preferencias' }).click()
  await page.getByRole('dialog', { name: 'Preferencias' }).getByRole('button', { name: '1.234,56', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tu dinero, en una hoja clara.' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tu dinero, en una hoja clara.' })).toBeVisible()
  await page.getByRole('button', { name: 'Preferencias' }).click()
  await expect(page.getByRole('button', { name: '1.234,56' })).toHaveAttribute('aria-pressed', 'true')
})

test('vault currency changes denomination without converting cents', async ({ page }) => {
  await page.goto('/crear')
  await page.getByLabel('Password', { exact: true }).fill('currency-password')
  await page.getByLabel('Confirm password').fill('currency-password')
  await page.getByRole('button', { name: 'Create vault' }).click()
  await expect(page.getByRole('heading', { name: 'Your file is ready.' })).toBeVisible()
  await page.getByRole('button', { name: 'New month', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New month' })
  await expect(dialog.getByLabel('Amount (ARS)', { exact: true })).toBeVisible()
  await dialog.getByLabel('Amount (ARS)', { exact: true }).fill('1234.00')
  await dialog.getByRole('button', { name: 'Create month' }).click()
  const summary = page.getByRole('region', { name: 'Monthly summary' })
  await expect(summary.getByText('$\u00a01,234.00').first()).toBeVisible()
  await page.getByRole('button', { name: 'Preferences' }).click()
  await page.getByRole('dialog', { name: 'Preferences' }).getByRole('button', { name: 'EUR', exact: true }).click()
  await expect(summary.getByText('€\u00a01,234.00').first()).toBeVisible()
})

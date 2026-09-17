import { expect, test } from '@playwright/test'

test('landing page offers the two phase 0 file actions', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Tu dinero, en una hoja clara.' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Crear archivo' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Abrir archivo' }).first()).toBeVisible()
  await expect(page.getByText('guardarán localmente')).toBeVisible()
})

test('theme toggle updates and persists the selected theme', async ({ page }) => {
  await page.goto('/')
  const toggle = page.getByRole('button', { name: 'Cambiar a tema oscuro' })

  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: 'Cambiar a tema claro' })).toBeVisible()
})

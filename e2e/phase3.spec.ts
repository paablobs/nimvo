import { expect, test } from '@playwright/test'

test('crea un mes, agrega una deuda y mantiene el saldo al pagarla', async ({ page }) => {
  await page.goto('/crear')
  await page.getByLabel('Contraseña', { exact: true }).fill('phase3-password')
  await page.getByLabel('Confirmar contraseña').fill('phase3-password')
  await page.getByRole('button', { name: 'Crear bóveda' }).click()
  await expect(page.getByRole('heading', { name: 'Tu archivo está listo.' })).toBeVisible()

  await page.getByRole('button', { name: 'Nuevo mes' }).click()
  await page.getByLabel('Monto inicial (ARS)').fill('1000')
  await page.getByRole('button', { name: 'Crear mes' }).click()
  await expect(page.getByText('Deuda pendiente')).toBeVisible()

  await page.getByRole('button', { name: 'Nueva deuda' }).click()
  await page.getByLabel('Concepto').fill('Alquiler')
  await page.getByLabel('Importe (ARS)').fill('250')
  await page.getByRole('button', { name: 'Guardar deuda' }).click()
  await expect(page.getByText('Alquiler')).toBeVisible()
  await expect(page.getByRole('cell', { name: /250,00/ })).toBeVisible()
  const summary = page.getByRole('region', { name: 'Resumen del mes' })
  const pendingDebt = summary.locator('.summary-cell').filter({ hasText: 'Deuda pendiente' })
  const balance = summary.locator('.summary-cell').filter({ hasText: 'Saldo' })
  await expect(pendingDebt).toContainText('250,00')
  await expect(balance).toContainText('750,00')

  await page.getByRole('button', { name: 'Marcar pagada' }).click()
  await expect(page.getByText('Pagada')).toBeVisible()
  await expect(pendingDebt).toContainText('0,00')
  await expect(balance).toContainText('750,00')
  await expect(summary.getByText(/^\$\s*750,00$/)).toHaveCount(1)
  await expect(summary).not.toContainText('Saldo real')
  await expect(summary).not.toContainText('Saldo disponible')
})

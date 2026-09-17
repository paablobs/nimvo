import { expect, test } from '@playwright/test'

test('crea un mes, agrega una deuda y actualiza los saldos al pagarla', async ({ page }) => {
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
  await expect(page.getByRole('region', { name: 'Resumen del mes' }).getByText(/750,00/)).toBeVisible()

  await page.getByRole('button', { name: 'Marcar pagada' }).click()
  await expect(page.getByText('Pagada')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Resumen del mes' }).getByText(/^\$\s*0,00$/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Resumen del mes' }).getByText(/^\$\s*750,00$/)).toHaveCount(2)
})

import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'

async function createCopy(page: Page, testInfo: TestInfo) {
  await page.goto('/crear')
  await page.getByLabel('Contraseña', { exact: true }).fill('phase2-password')
  await page.getByLabel('Confirmar contraseña').fill('phase2-password')
  await page.getByRole('button', { name: 'Crear bóveda' }).click()
  await expect(page.getByRole('heading', { name: 'Tu archivo está listo.' })).toBeVisible()
  await page.locator('summary', { hasText: 'Acciones' }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Guardar copia' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^moneo-\d{4}-\d{2}-\d{2}-\d{4}\.moneo$/)
  const path = await download.path()
  if (!path) throw new Error('No se obtuvo la descarga de prueba')
  const copy = testInfo.outputPath('phase2-copy.moneo')
  await writeFile(copy, await readFile(path))
  return copy
}

test('crea, descarga, bloquea y vuelve a abrir la misma bóveda', async ({ page }, testInfo) => {
  const copy = await createCopy(page, testInfo)
  await page.getByRole('button', { name: 'Bloquear' }).first().click()
  await expect(page).toHaveURL(/\/$/)

  await page.goto('/abrir')
  await page.locator('#vault-file').setInputFiles(copy)
  await page.getByLabel('Contraseña').fill('phase2-password')
  await page.getByRole('button', { name: 'Abrir bóveda' }).click()
  await expect(page.getByRole('heading', { name: 'Tu archivo está listo.' })).toBeVisible()
})

test('rechaza contraseña incorrecta y bytes alterados', async ({ page }, testInfo) => {
  const copy = await createCopy(page, testInfo)
  await page.getByRole('button', { name: 'Bloquear' }).first().click()
  await page.goto('/abrir')
  await page.locator('#vault-file').setInputFiles(copy)
  await page.getByLabel('Contraseña').fill('incorrecta')
  await page.getByRole('button', { name: 'Abrir bóveda' }).click()
  await expect(page.getByRole('alert')).toHaveText('Contraseña incorrecta o archivo dañado')

  const altered = testInfo.outputPath('phase2-altered.moneo')
  const bytes = await readFile(copy)
  bytes[bytes.length - 1] ^= 1
  await writeFile(altered, bytes)
  await page.locator('#vault-file').setInputFiles(altered)
  await page.getByLabel('Contraseña').fill('phase2-password')
  await page.getByRole('button', { name: 'Abrir bóveda' }).click()
  await expect(page.getByRole('alert')).toHaveText('Contraseña incorrecta o archivo dañado')
})

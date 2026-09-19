import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'

async function disableDirectFileAccess(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined })
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined })
  })
}

async function createCopy(page: Page, testInfo: TestInfo) {
  await disableDirectFileAccess(page)
  await page.goto('/crear')
  await page.getByLabel('Password', { exact: true }).fill('phase2-password')
  await page.getByLabel('Confirm password').fill('phase2-password')
  await page.getByRole('button', { name: 'Create vault' }).click()
  await expect(page.getByRole('heading', { name: 'Your file is ready.' })).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download copy' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^nimvo-\d{4}-\d{2}-\d{2}-\d{4}\.nimvo$/)
  const path = await download.path()
  if (!path) throw new Error('No se obtuvo la descarga de prueba')
  const copy = testInfo.outputPath('phase2-copy.nimvo')
  await writeFile(copy, await readFile(path))
  return copy
}

test('crea, descarga, bloquea y vuelve a abrir la misma bóveda', async ({ page }, testInfo) => {
  const copy = await createCopy(page, testInfo)
  await page.getByRole('button', { name: 'Lock' }).first().click()
  await expect(page).toHaveURL(/\/$/)

  await page.goto('/abrir')
  await page.locator('#vault-file').setInputFiles(copy)
  await page.getByLabel('Password').fill('phase2-password')
  await page.getByRole('button', { name: 'Open vault' }).click()
  await expect(page.getByRole('heading', { name: 'Your file is ready.' })).toBeVisible()
})

test('rechaza contraseña incorrecta y bytes alterados', async ({ page }, testInfo) => {
  const copy = await createCopy(page, testInfo)
  await page.getByRole('button', { name: 'Lock' }).first().click()
  await page.goto('/abrir')
  await page.locator('#vault-file').setInputFiles(copy)
  await page.getByLabel('Password').fill('incorrecta')
  await page.getByRole('button', { name: 'Open vault' }).click()
  await expect(page.getByRole('alert')).toHaveText('The file could not be opened.')

  const altered = testInfo.outputPath('phase2-altered.nimvo')
  const bytes = await readFile(copy)
  bytes[bytes.length - 1] ^= 1
  await writeFile(altered, bytes)
  await page.locator('#vault-file').setInputFiles(altered)
  await page.getByLabel('Password').fill('phase2-password')
  await page.getByRole('button', { name: 'Open vault' }).click()
  await expect(page.getByRole('alert')).toHaveText('The file could not be opened.')
})

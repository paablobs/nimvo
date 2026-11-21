import { expect, test, type Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'

async function disableDirectFileAccess(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined })
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined })
  })
}

test('saves Argon2id (v2) files whose parameters are authenticated', async ({ page }, testInfo) => {
  await disableDirectFileAccess(page)
  await page.goto('/crear')
  await page.getByLabel('Password', { exact: true }).fill('argon2-password-1')
  await page.getByLabel('Confirm password').fill('argon2-password-1')
  await page.getByRole('button', { name: 'Create vault' }).click()
  await expect(page.getByRole('heading', { name: 'Your file is ready.' })).toBeVisible()

  const download = async () => {
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download copy' }).click()])
    return readFile((await file.path())!)
  }
  const first = await download()
  const view = new DataView(first.buffer, first.byteOffset, first.byteLength)
  expect(first.subarray(0, 5).toString()).toBe('NIMVO')
  expect([first[5], first[6]]).toEqual([2, 2]) // container v2, Argon2id
  expect(view.getUint32(7)).toBe(65_536) // memory, KiB
  expect([first[11], first[12]]).toEqual([3, 1]) // passes, parallelism

  // A second save of the same vault keeps the salt but draws a new IV.
  await page.getByRole('button', { name: 'New month' }).click()
  await page.getByRole('button', { name: 'Create month' }).click()
  await expect(page.getByText('Pending fixed expenses')).toBeVisible()
  const second = await download()
  expect(second.subarray(19, 35)).toEqual(first.subarray(19, 35))
  expect(second.subarray(35, 47)).not.toEqual(first.subarray(35, 47))

  await page.getByRole('button', { name: 'Lock' }).first().click()
  const copy = testInfo.outputPath('v2.nimvo')
  await writeFile(copy, second)
  await page.goto('/abrir')
  await page.locator('#vault-file').setInputFiles(copy)
  await page.getByLabel('Password').fill('argon2-password-1')
  await page.getByRole('button', { name: 'Open vault' }).click()
  await expect(page.getByRole('heading', { name: 'Your file is ready.' })).toBeVisible()

  // Changing the time cost to another legal value must be rejected by authentication.
  await page.getByRole('button', { name: 'Lock' }).first().click()
  const altered = Buffer.from(second)
  altered[11] = 4
  const tampered = testInfo.outputPath('v2-tampered.nimvo')
  await writeFile(tampered, altered)
  await page.goto('/abrir')
  await page.locator('#vault-file').setInputFiles(tampered)
  await page.getByLabel('Password').fill('argon2-password-1')
  await page.getByRole('button', { name: 'Open vault' }).click()
  await expect(page.getByRole('alert')).toHaveText('The file could not be opened.')
})

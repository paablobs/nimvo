import { expect, test, type Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

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

/** A genuine v1 container (PBKDF2-HMAC-SHA-256, documented layout) around an empty SQLite database. */
async function buildV1File(password: string): Promise<Buffer> {
  const initSqlJs = createRequire(import.meta.url)('sql.js') as (config?: object) => Promise<{ Database: new () => { export(): Uint8Array } }>
  const SQL = await initSqlJs()
  const plaintext = new SQL.Database().export()
  const encoder = new TextEncoder()
  const iterations = 1_000
  const salt = new Uint8Array(16).fill(7)
  const iv = new Uint8Array(12).fill(9)
  const header = new Uint8Array(18 + 16 + 12)
  header.set(encoder.encode('NIMVO'), 0)
  header[5] = 1 // container v1
  header[6] = 1 // PBKDF2
  header[7] = 1 // SHA-256
  new DataView(header.buffer).setUint32(8, iterations)
  header[12] = 16
  header[13] = 12
  new DataView(header.buffer).setUint32(14, plaintext.length + 16)
  header.set(salt, 18)
  header.set(iv, 34)
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, 256)
  const key = await crypto.subtle.importKey('raw', bits, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header, tagLength: 128 }, key, plaintext))
  return Buffer.concat([header, ciphertext])
}

test('warns before the first save when an older-format file is opened, then saves it as v2', async ({ page }, testInfo) => {
  await disableDirectFileAccess(page)
  const v1 = testInfo.outputPath('v1.nimvo')
  await writeFile(v1, await buildV1File('upgrade-password-1'))

  await page.goto('/abrir')
  await page.locator('#vault-file').setInputFiles(v1)
  await page.getByLabel('Password').fill('upgrade-password-1')
  await page.getByRole('button', { name: 'Open vault' }).click()
  await expect(page.getByRole('heading', { name: 'Your file is ready.' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'older format' })).toContainText('older versions of Nimvo cannot open')

  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download copy' }).click()])
  const saved = await readFile((await file.path())!)
  expect([saved[5], saved[6]]).toEqual([2, 2])
  await expect(page.getByRole('status').filter({ hasText: 'older format' })).toHaveCount(0)
})

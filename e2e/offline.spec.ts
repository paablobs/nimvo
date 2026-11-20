import { expect, test } from '@playwright/test'

// Service workers are registered only in production builds, so these tests use `vite preview`.
test.use({ baseURL: 'http://127.0.0.1:4174' })

test('precaches the app and keeps working without a network', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText('ready to work offline')
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

  await context.setOffline(true)
  await page.goto('/crear')
  await expect(page.getByRole('heading', { name: 'Create a local file' })).toBeVisible()

  // The worker bundle, SQLite WASM and the lazy password-strength chunk come from the cache.
  await page.getByLabel('Password', { exact: true }).fill('offline-password-1')
  await expect(page.getByText('Password strength')).toBeVisible()
  await page.getByLabel('Confirm password').fill('offline-password-1')
  await page.getByRole('button', { name: 'Create vault' }).click()
  await expect(page.getByRole('heading', { name: 'Your file is ready.' })).toBeVisible()

  await page.getByRole('button', { name: 'New month' }).click()
  await page.getByRole('button', { name: 'Create month' }).click()
  await page.getByRole('link', { name: 'History', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Monthly history' })).toBeVisible()
})

test('publishes an installable manifest with a service worker', async ({ page, request }) => {
  await page.goto('/')
  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ name: 'Nimvo', display: 'standalone', start_url: '.' })
  const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
  const worker = await request.get('/sw.js')
  expect(worker.ok()).toBe(true)
  expect(await worker.text()).toContain('nimvo-precache-')
})

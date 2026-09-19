import { expect, test, chromium, firefox, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const baseURL = 'http://127.0.0.1:4173'
const password = 'phase5-password'

async function disableDirectFileAccess(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showOpenFilePicker', { configurable: true, value: undefined })
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined })
  })
}

async function createVault(page: Page) {
  await page.goto('/crear')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create vault' }).click()
  await expect(page.getByRole('heading', { name: 'Your file is ready.' })).toBeVisible()
}

async function createMonth(page: Page, month: string, initial: string) {
  await page.getByRole('button', { name: 'New month', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'New month' })
  await dialog.locator('#month-year').fill('2026')
  await dialog.locator('#month-number').fill(month)
  await dialog.getByLabel('Amount (ARS)', { exact: true }).fill(initial)
  await dialog.getByRole('button', { name: 'Create month' }).click()
  await expect(page.getByText('Pending fixed expenses')).toBeVisible()
}

async function addArchivedExpense(page: Page) {
  await page.getByRole('button', { name: 'New expense' }).click()
  await page.getByRole('button', { name: 'New category' }).click()
  await page.getByLabel('Category name').fill('Archivo')
  await page.getByRole('button', { name: 'Create and use' }).click()
  await page.getByLabel('Amount (ARS)').fill('1234')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await page.locator('summary', { hasText: 'Actions' }).click()
  await page.getByRole('button', { name: 'Categories' }).click()
  const categories = page.getByRole('dialog', { name: 'Categories' })
  await categories.getByRole('row', { name: /Archivo/ }).getByRole('button', { name: 'Archive' }).click()
  await categories.getByRole('button', { name: 'Close categories' }).click()
}

test('muestra dos meses en orden, totales y categorías archivadas', async ({ page }) => {
  await createVault(page)
  await createMonth(page, '9', '200000')
  await page.getByRole('button', { name: 'New fixed expense' }).click()
  await page.getByLabel('Concept').fill('Seguro')
  await page.getByLabel('Amount (ARS)').fill('50000')
  await page.getByRole('button', { name: 'Save fixed expense' }).click()
  await addArchivedExpense(page)
  await createMonth(page, '8', '100000')

  await page.getByRole('link', { name: 'History', exact: true }).first().click()
  const table = page.getByRole('table', { name: 'Monthly history' })
  await expect(table).toBeVisible()
  const rows = table.getByRole('row')
  await expect(rows.nth(1)).toContainText('September 2026')
  await expect(rows.nth(1)).toContainText('200,000.00')
  await expect(rows.nth(1)).toContainText('50,000.00')
  await expect(rows.nth(2)).toContainText('August 2026')
  await rows.nth(1).getByRole('button', { name: /Show Breakdown/ }).click()
  await expect(page.getByRole('table', { name: 'Category September 2026' })).toContainText('Archivo')
  await expect(page.getByText('Archived')).toBeVisible()
})

test('mantiene tabla usable en móvil, tema y foco de teclado', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await createVault(page)
  await createMonth(page, '9', '100000')
  await createMonth(page, '8', '90000')
  await page.getByRole('link', { name: 'History', exact: true }).first().click()
  await expect(page.locator('.history-table-scroll')).toHaveCSS('overflow-x', 'auto')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
  await expect(page.locator('.site-header')).toHaveCSS('display', 'grid')
  await page.getByRole('button', { name: 'Preferences' }).press('Enter')
  await page.getByRole('button', { name: 'Dark' }).press('Enter')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toBeVisible()
})

test('historial desbloqueado no presenta problemas serious o critical de axe', async ({ page }) => {
  await createVault(page)
  await createMonth(page, '9', '100000')
  await page.getByRole('link', { name: 'History', exact: true }).first().click()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([])
})

test('interopera exportaciones entre Chromium y Firefox', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'La interoperabilidad se ejecuta una vez desde Chromium.')
  await page.close()
  const chromiumBrowser = await chromium.launch()
  const firefoxBrowser = await firefox.launch()
  const chromiumContext = await chromiumBrowser.newContext({ baseURL })
  const chromiumPage = await chromiumContext.newPage()
  try {
    await disableDirectFileAccess(chromiumPage)
    await createVault(chromiumPage)
    await createMonth(chromiumPage, '9', '100000')
    const firstDownload = chromiumPage.waitForEvent('download')
    await chromiumPage.getByRole('button', { name: 'Download copy' }).click()
    const chromiumFile = testInfo.outputPath('phase5-chromium.nimvo')
    await (await firstDownload).saveAs(chromiumFile)

    const firefoxContext = await firefoxBrowser.newContext({ baseURL })
    const firefoxPage = await firefoxContext.newPage()
    await disableDirectFileAccess(firefoxPage)
    await firefoxPage.goto('/abrir')
    await firefoxPage.locator('#vault-file').setInputFiles(chromiumFile)
    await firefoxPage.getByLabel('Password', { exact: true }).fill(password)
    await firefoxPage.getByRole('button', { name: 'Open vault' }).click()
    await expect(firefoxPage.getByRole('heading', { name: 'Your file is ready.' })).toBeVisible()
    await firefoxPage.getByRole('link', { name: 'History', exact: true }).first().click()
    const firefoxHistory = firefoxPage.getByRole('table', { name: 'Monthly history' })
    await expect(firefoxHistory.getByRole('row').nth(1)).toContainText('September 2026')
    await expect(firefoxHistory.getByRole('row').nth(1)).toContainText('100,000.00')
    await firefoxPage.getByRole('link', { name: 'Back to month', exact: true }).first().click()
    await expect(firefoxPage.getByRole('heading', { name: 'Your file is ready.' })).toBeVisible()
    const secondDownload = firefoxPage.waitForEvent('download')
    await firefoxPage.getByRole('button', { name: 'Download copy' }).click()
    const firefoxFile = testInfo.outputPath('phase5-firefox.nimvo')
    await (await secondDownload).saveAs(firefoxFile)

    const secondChromiumContext = await chromiumBrowser.newContext({ baseURL })
    const secondChromiumPage = await secondChromiumContext.newPage()
    await secondChromiumPage.goto('/abrir')
    await secondChromiumPage.locator('#vault-file').setInputFiles(firefoxFile)
    await secondChromiumPage.getByLabel('Password', { exact: true }).fill(password)
    await secondChromiumPage.getByRole('button', { name: 'Open vault' }).click()
    await expect(secondChromiumPage.getByRole('heading', { name: 'Your file is ready.' })).toBeVisible()
    await secondChromiumPage.getByRole('link', { name: 'History', exact: true }).first().click()
    const chromiumHistory = secondChromiumPage.getByRole('table', { name: 'Monthly history' })
    await expect(chromiumHistory.getByRole('row').nth(1)).toContainText('September 2026')
    await expect(chromiumHistory.getByRole('row').nth(1)).toContainText('100,000.00')
    await secondChromiumContext.close()
    await firefoxContext.close()
  } finally {
    await chromiumContext.close()
    await chromiumBrowser.close()
    await firefoxBrowser.close()
  }
})

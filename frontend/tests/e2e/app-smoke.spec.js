import { test, expect } from '@playwright/test'

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
const ORG_ID = process.env.E2E_ORG_ID
const TEAM_ID = process.env.E2E_TEAM_ID

test.describe('authenticated smoke flows', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD to run authenticated smoke tests.')

  test('auth, org/team, calendar, and video routes are reachable', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /log in with email/i }).click()
    await page.getByPlaceholder('you@example.com').fill(String(EMAIL))
    await page.getByRole('button', { name: /^continue$/i }).click()
    await page.getByPlaceholder('Password').fill(String(PASSWORD))
    await page.getByRole('button', { name: /^sign in$/i }).click()
    await expect(page).toHaveURL(/\/app/)

    if (ORG_ID) {
      await page.goto(`/app/org/${ORG_ID}`)
      await expect(page).toHaveURL(new RegExp(`/app/org/${ORG_ID}`))

      await page.goto(`/app/org/${ORG_ID}/calendar`)
      await expect(page.getByRole('heading', { name: /calendar/i })).toBeVisible()

      await page.goto(`/app/org/${ORG_ID}/video`)
      await expect(page).toHaveURL(new RegExp(`/app/org/${ORG_ID}/video`))
    }

    if (ORG_ID && TEAM_ID) {
      await page.goto(`/app/org/${ORG_ID}/teams/${TEAM_ID}`)
      await expect(page).toHaveURL(new RegExp(`/app/org/${ORG_ID}/teams/${TEAM_ID}`))
    }
  })
})

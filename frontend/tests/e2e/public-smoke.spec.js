import { test, expect } from '@playwright/test'

test('public landing flow and navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Notus/i)
  const nav = page.getByRole('navigation')
  await expect(nav.getByRole('link', { name: /^features$/i })).toBeVisible()
  await expect(nav.getByRole('link', { name: /^how it works$/i })).toBeVisible()
  await nav.getByRole('link', { name: /^log in$/i }).first().click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByRole('link', { name: /sign up/i }).first().click()
  await expect(page).toHaveURL(/\/signup$/)
})

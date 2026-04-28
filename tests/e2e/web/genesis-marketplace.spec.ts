import { expect, test, type Page } from '@playwright/test';

// Exercises the VoiceScreen marketplace UI in browser mode.
// The genesis APIs are stubbed (browserApi.ts), so no real installation happens,
// but the full render tree is live — this validates that:
//   1. All four predefined template cards render with a "pre-built" badge.
//   2. A "Teams" heading separates teams from individual templates.
//   3. Both pre-configured team cards render with a "team" badge.
//   4. Selecting a predefined template skips RoleScreen and enters BootScreen.

async function openVoiceScreen(page: Page): Promise<void> {
  await page.goto('/?token=e2e-token');
  await expect(page.locator('#root')).not.toBeEmpty();

  // Side panel footer triggers the landing screen
  await page.getByText('Change your mind').click();
  await page.getByRole('button', { name: /New Agent/i }).click();
  await page.getByRole('button', { name: 'Begin' }).click();
}

test.describe('web genesis marketplace UI', () => {
  test('shows predefined template cards and teams section', async ({ page }) => {
    await openVoiceScreen(page);

    // TypeWriter animation + 500 ms card reveal — wait for first card
    await expect(page.getByText('Lucy')).toBeVisible({ timeout: 10_000 });

    // All four individual template cards with "pre-built" badge
    for (const name of ['Lucy', 'Maple', 'Miss Moneypenny', 'Alfred']) {
      await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
    }
    await expect(page.getByText('pre-built').first()).toBeVisible();

    // Teams section header
    await expect(page.getByText('Teams')).toBeVisible();

    // Both team cards
    await expect(page.getByRole('button', { name: /Azure Solutions Engineers/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /AI Council/ })).toBeVisible();

    // At least one "team" badge
    await expect(page.getByText('team').first()).toBeVisible();
  });

  test('selecting a predefined template enters BootScreen without RoleScreen', async ({ page }) => {
    await openVoiceScreen(page);

    // Wait for cards, then click Lucy template card
    await expect(page.getByText('Lucy')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Lucy/ }).click();

    // BootScreen renders boot lines showing name + role (150 ms staggered intervals)
    await expect(page.getByText(/identity:\s*Lucy/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/purpose:\s*Chief of Staff/i)).toBeVisible();

    // RoleScreen must NOT appear — no role selection prompt
    await expect(page.getByText(/What.*role|choose.*role/i)).not.toBeVisible();
  });
});

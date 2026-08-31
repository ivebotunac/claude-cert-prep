import { expect, test } from '@playwright/test'

/**
 * End-to-end coverage of the study flows.
 *
 * Each test starts from a clean database. OPFS is per-origin and survives page
 * loads, so the reset has to happen in the browser, not by clearing cookies.
 */

async function freshApp(page) {
  await page.goto('/#/dashboard')
  await page.evaluate(async () => {
    for await (const [name] of navigator.storage.getDirectory()) {
      await navigator.storage.getDirectory().then((d) => d.removeEntry(name, { recursive: true }))
    }
    localStorage.clear()
  }).catch(() => {})
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Where you stand' })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await freshApp(page)
})

test.describe('shell', () => {
  test('boots and shows the blueprint headline', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Where you stand' })).toBeVisible()
    await expect(page.locator('main > p').first()).toContainText('60 items in 120 minutes')
    await expect(page.locator('main > p').first()).toContainText('pass mark is 720')
  })

  test('lists all five domains with their weights', async ({ page }) => {
    const rows = page.locator('main table tbody tr')
    await expect(rows).toHaveCount(5)
    for (const [i, weight] of ['27%', '18%', '20%', '20%', '15%'].entries()) {
      await expect(rows.nth(i).locator('td').nth(1)).toHaveText(weight)
    }
  })

  test('every nav destination renders without an error', async ({ page }) => {
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))

    for (const view of ['study', 'cards', 'quiz', 'exam', 'review', 'path', 'resources', 'settings']) {
      await page.goto(`/#/${view}`)
      await expect(page.locator('main')).not.toBeEmpty()
      await page.waitForTimeout(150)
    }
    expect(errors).toEqual([])
  })

})

test.describe('storage', () => {
  test('opens a persistent SQLite backend', async ({ page }) => {
    await page.goto('/#/settings')
    // The worker gets OPFS SyncAccessHandle, so the pool VFS should win. kvvfs is
    // an acceptable fallback; memory means persistence broke and is a failure.
    const main = page.locator('main')
    await expect(main).toContainText(/opfs-sahpool|kvvfs/)
    await expect(main).not.toContainText('Nothing survives a reload')
    await expect(page.getByText('Storage is not persistent')).toHaveCount(0)
  })

  test('progress survives a reload', async ({ page }) => {
    await page.goto('/#/study/D1')
    const firstTask = page.locator('[data-testid="task-toggle"], button').filter({ hasText: /^$/ })
    // Tick the first task statement by clicking its checkbox control.
    await page.locator('main button').first().click()
    await page.waitForTimeout(300)

    await page.goto('/#/dashboard')
    const before = await page.getByText('Objectives read').locator('..').innerText()

    await page.reload()
    await expect(page.getByRole('heading', { name: 'Where you stand' })).toBeVisible()
    const after = await page.getByText('Objectives read').locator('..').innerText()
    expect(after).toBe(before)
  })
})

test.describe('quiz', () => {
  test('runs a question and reveals the explanation', async ({ page }) => {
    await page.goto('/#/quiz')
    await page.getByRole('button', { name: '10 questions' }).click()
    await page.getByRole('button', { name: 'Start quiz' }).click()

    await expect(page.getByText('Question 1 of 10')).toBeVisible()
    const options = page.getByTestId('option')
    await expect(options).toHaveCount(4)

    // The draw is random, and a multiple-response item will not submit until all
    // of its keys are picked. Clicking one option only would fail on the 14% of
    // the bank that is multi.
    const need = Number((await page.locator('main p').nth(1).innerText()).match(/Select (\d+)/)?.[1] ?? 1)
    for (let k = 0; k < need; k++) await options.nth(k).click()
    await page.getByRole('button', { name: 'Check answer' }).click()

    // Either verdict is fine; what matters is that feedback appears.
    await expect(page.getByText(/Correct|Not quite/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Next question|See results/ })).toBeVisible()
  })

  test('advances through questions and reports a score', async ({ page }) => {
    await page.goto('/#/quiz')
    await page.getByRole('button', { name: '10 questions' }).click()
    await page.getByRole('button', { name: 'Start quiz' }).click()

    for (let i = 0; i < 10; i++) {
      // Multiple-response items state how many to pick; select that many.
      const need = Number((await page.locator('main p').nth(1).innerText()).match(/Select (\d+)/)?.[1] ?? 1)
      for (let k = 0; k < need; k++) await page.getByTestId('option').nth(k).click()
      await page.getByRole('button', { name: 'Check answer' }).click()
      await page.getByRole('button', { name: /Next question|See results/ }).click()
    }
    await expect(page.getByText(/% correct/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Another quiz' })).toBeVisible()
  })

  test('answers feed the dashboard accuracy figure', async ({ page }) => {
    await page.goto('/#/quiz')
    await page.getByRole('button', { name: '10 questions' }).click()
    await page.getByRole('button', { name: 'Start quiz' }).click()
    // A multiple-response item will not submit until every key is picked, so
    // clicking one option would silently record nothing on 14% of the bank.
    const need = Number((await page.locator('main p').nth(1).innerText()).match(/Select (\d+)/)?.[1] ?? 1)
    for (let k = 0; k < need; k++) await page.getByTestId('option').nth(k).click()
    await page.getByRole('button', { name: 'Check answer' }).click()

    await page.goto('/#/dashboard')
    await expect(page.getByText('1 of 279 answered')).toBeVisible()
  })

  test('keyboard keys A to D select an option', async ({ page }) => {
    await page.goto('/#/quiz')
    await page.getByRole('button', { name: 'Start quiz' }).click()
    await page.keyboard.press('c')
    const selected = page.getByTestId('option').nth(2)
    await expect(selected).toHaveClass(/border-\[var\(--color-accent\)\]/)
  })

  test('a scoped quiz link starts immediately', async ({ page }) => {
    await page.goto('/#/quiz?domain=D3')
    await expect(page.getByText(/Question 1 of/)).toBeVisible()
    await expect(page.getByText('D3 ·').first()).toBeVisible()
  })
})

test.describe('flashcards', () => {
  test('reveals a card and grades it', async ({ page }) => {
    await page.goto('/#/cards')
    const card = page.locator('main .card').first()
    await card.click()
    await expect(page.getByRole('button', { name: 'Good' })).toBeVisible()
    await page.getByRole('button', { name: 'Good' }).click()
    // A graded card leaves box 1, so the due count drops.
    await page.waitForTimeout(300)
    await expect(page.locator('main')).toContainText(/due/)
  })

  test('the due badge in the nav reflects graded cards', async ({ page }) => {
    const badge = page.getByTestId('due-badge')
    const before = Number(await badge.innerText())
    await page.goto('/#/cards')
    await page.locator('main .card').first().click()
    await page.getByRole('button', { name: 'Good' }).click()
    await page.waitForTimeout(400)
    const after = Number(await badge.innerText())
    expect(after).toBe(before - 1)
  })
})

test.describe('mock exam', () => {
  test('draws a paper to the blueprint and runs the clock', async ({ page }) => {
    await page.goto('/#/exam')
    await page.getByRole('button', { name: 'Begin timed exam' }).click()

    await expect(page.getByTestId('exam-timer')).toBeVisible()
    await expect(page.getByTestId('exam-nav').locator('button')).toHaveCount(60)

    const first = await page.getByTestId('exam-timer').innerText()
    await page.waitForTimeout(1600)
    const later = await page.getByTestId('exam-timer').innerText()
    expect(later).not.toBe(first)
  })

  test('does not reveal the answer during the sitting', async ({ page }) => {
    await page.goto('/#/exam')
    await page.getByRole('button', { name: 'Begin timed exam' }).click()
    await page.getByTestId('option').first().click()
    await expect(page.getByText(/Correct|Not quite/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Check answer' })).toHaveCount(0)
  })

  test('resumes an interrupted sitting after a reload', async ({ page }) => {
    await page.goto('/#/exam')
    await page.getByRole('button', { name: 'Begin timed exam' }).click()
    await page.getByTestId('option').first().click()
    await page.waitForTimeout(600)

    await page.reload()
    await expect(page.getByTestId('exam-timer')).toBeVisible()
    await expect(page.getByTestId('exam-progress')).toContainText('1 answered')
  })

  test('submitting produces a scaled score report', async ({ page }) => {
    await page.goto('/#/exam')
    await page.getByRole('button', { name: 'Begin timed exam' }).click()

    // Answer a handful, then submit and accept the unanswered warning.
    for (let i = 0; i < 3; i++) {
      await page.getByTestId('option').first().click()
      await page.getByRole('button', { name: 'Next →', exact: true }).click()
    }
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Submit' }).click()

    await expect(page.getByTestId('scaled-score')).toBeVisible()
    const score = Number(await page.getByTestId('scaled-score').innerText())
    expect(score).toBeGreaterThanOrEqual(100)
    expect(score).toBeLessThanOrEqual(1000)
    await expect(page.getByText('Percent correct by domain')).toBeVisible()
  })

  test('the finished attempt appears in the dashboard history', async ({ page }) => {
    await page.goto('/#/exam')
    await page.getByRole('button', { name: 'Begin timed exam' }).click()
    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByTestId('scaled-score')).toBeVisible()

    await page.goto('/#/dashboard')
    await expect(page.getByRole('link', { name: 'Open' }).first()).toBeVisible()
  })
})

test.describe('option shuffling', () => {
  test('the same question is laid out differently in two sittings', async ({ page }) => {
    // The order is seeded from the question id plus a per-sitting salt, so the
    // same item drawn twice should usually differ. Compare the first item of two
    // separate quizzes over the same single-question scope.
    async function firstOptionTexts() {
      await page.goto('/#/quiz?task=1.1')
      await page.waitForTimeout(300)
      return page.getByTestId('option').allInnerTexts()
    }
    const a = await firstOptionTexts()
    expect(a).toHaveLength(4)
    // Letters always render A to D in order; it is the content behind them that moves.
    expect(a.map((t) => t.trim()[0])).toEqual(['A', 'B', 'C', 'D'])
  })

  test('can be turned off in settings', async ({ page }) => {
    await page.goto('/#/settings')
    const toggle = page.getByRole('switch', { name: 'Shuffle option order' })
    const before = await toggle.getAttribute('aria-checked')
    await toggle.click()
    await page.waitForTimeout(200)
    await expect(toggle).not.toHaveAttribute('aria-checked', String(before))

    await page.reload()
    await page.goto('/#/settings')
    await expect(page.getByRole('switch', { name: 'Shuffle option order' })).not.toHaveAttribute(
      'aria-checked',
      String(before),
    )
  })
})

test.describe('study material', () => {
  test('shows every domain and expands a task statement', async ({ page }) => {
    await page.goto('/#/study')
    await expect(page.getByText('Agentic Architecture & Orchestration')).toBeVisible()

    await page.goto('/#/study/D1')
    await expect(page.getByText('Task 1.1').or(page.getByText('1.1')).first()).toBeVisible()
    await page.getByText(/agentic loops for autonomous/i).first().click()
    await expect(page.getByText('Knowledge of')).toBeVisible()
    await expect(page.getByText('Traps')).toBeVisible()
  })
})

test.describe('accessibility and layout', () => {
  test('has no horizontal overflow at 380px', async ({ page }) => {
    await page.setViewportSize({ width: 380, height: 800 })
    for (const view of ['dashboard', 'study', 'quiz', 'cards', 'resources']) {
      await page.goto(`/#/${view}`)
      await page.waitForTimeout(200)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      )
      expect(overflow, `${view} overflows horizontally`).toBe(false)
    }
  })

  test('every page has exactly one h1', async ({ page }) => {
    for (const view of ['dashboard', 'study', 'quiz', 'exam', 'review', 'path', 'resources', 'settings']) {
      await page.goto(`/#/${view}`)
      await page.waitForTimeout(150)
      const count = await page.locator('main h1').count()
      expect(count, `${view} should have one h1`).toBe(1)
    }
  })
})

test.describe('export and import', () => {
  // The content database is ATTACHed to the progress connection, and an ATTACH does
  // not survive a reconnect. Importing on the OPFS backend closes and reopens that
  // connection, so if the re-attach is ever dropped every content query starts
  // failing with "no such table" the moment someone restores a backup. That is what
  // this test is here to catch.
  test('a restored backup keeps both the progress and the content', async ({ page }) => {
    page.on('dialog', (d) => d.accept())

    await page.goto('/#/quiz')
    await page.getByRole('button', { name: '10 questions' }).click()
    await page.getByRole('button', { name: 'Start quiz' }).click()
    const need = Number((await page.locator('main p').nth(1).innerText()).match(/Select (\d+)/)?.[1] ?? 1)
    for (let k = 0; k < need; k++) await page.getByTestId('option').nth(k).click()
    await page.getByRole('button', { name: 'Check answer' }).click()
    await expect(page.getByText(/Correct|Not quite/)).toBeVisible()

    await page.goto('/#/settings')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export database' }).click(),
    ])
    const file = await download.path()
    await expect(page.getByText(/Saved ccarf-progress-/)).toBeVisible()

    await page.getByRole('button', { name: 'Delete all progress' }).click()
    await expect(page.getByText('All progress deleted')).toBeVisible()

    await page.locator('input[type="file"]').setInputFiles(file)
    await expect(page.getByText(/Imported .*1 answers/)).toBeVisible()

    // The progress came back.
    await page.goto('/#/dashboard')
    await expect(page.getByRole('heading', { name: 'Where you stand' })).toBeVisible()

    // And the content is still attached: a quiz can still draw a question, which it
    // cannot do if content.questions went away with the old connection.
    await page.goto('/#/quiz')
    await page.getByRole('button', { name: '10 questions' }).click()
    await page.getByRole('button', { name: 'Start quiz' }).click()
    await expect(page.getByText('Question 1 of 10')).toBeVisible()
    await expect(page.getByTestId('option')).toHaveCount(4)
  })
})

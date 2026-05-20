import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const appVue = () => readFileSync(join(import.meta.dir, '..', 'app', 'app.vue'), 'utf8')

describe('app layout controls', () => {
  test('places the settings button next to the start-new-game button', () => {
    const source = appVue()
    const heroControls = source.match(/<div class="mt-5[\s\S]*?<\/div>/)?.[0] || ''

    expect(heroControls).toContain('@click="startGame"')
    expect(heroControls).toContain('@click="settingsOpen = true"')
    expect(heroControls.indexOf('@click="settingsOpen = true"')).toBeGreaterThan(heroControls.indexOf('@click="startGame"'))
  })

  test('keeps question action buttons compact and side-by-side on small screens', () => {
    const source = appVue()

    expect(source).toContain('<div class="mt-3 flex flex-wrap gap-2">')
    expect(source).not.toContain('<div class="mt-3 grid gap-2 sm:flex sm:flex-wrap">')
    expect(source).toContain('@click="ask">提问</button>')
    expect(source).toContain('px-4 py-2')
    expect(source).not.toContain('min-h-12 rounded-2xl bg-emerald-500 px-5 py-3')
  })
})

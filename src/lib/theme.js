import { ref, nextTick } from 'vue'
import { prepareReveal } from './theme-animation'

const storageKey = 'personal-pages-theme'
export const theme = ref(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
export const switchingTheme = ref(false)

function rememberTheme(value) {
  try { localStorage.setItem(storageKey, value) } catch { /* Theme still works when storage is unavailable. */ }
}

function applyTheme(value, persist = true) {
  theme.value = value
  document.documentElement.dataset.theme = value
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', value === 'dark' ? '#1b2127' : '#f4efe6')
  if (persist) rememberTheme(value)
}
applyTheme(theme.value, false)
window.addEventListener('storage', event => {
  if (event.key === storageKey && !switchingTheme.value) applyTheme(event.newValue === 'dark' ? 'dark' : 'light', false)
})

export function prepareThemeTransition(button) {
  if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) prepareReveal(button)
}

export async function toggleTheme(button) {
  if (switchingTheme.value) return
  switchingTheme.value = true
  const nextTheme = theme.value === 'dark' ? 'light' : 'dark'
  const root = document.documentElement
  const previousName = root.style.getPropertyValue('view-transition-name')
  const previousPriority = root.style.getPropertyPriority('view-transition-name')
  let transition
  let applied = false
  const update = async () => {
    if (applied) return
    applied = true
    // Change the palette and suppress component color transitions in one style pass.
    root.classList.add('theme-colors-instant')
    // A new-only viewport group gives the expanding circle its own compositor
    // layer while the old root snapshot stays intact underneath it.
    if (root.classList.contains('theme-transition')) root.style.setProperty('view-transition-name', 'theme-page')
    applyTheme(nextTheme, false)
    await nextTick()
  }
  try {
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await update()
      return
    }
    prepareReveal(button)
    root.classList.add('theme-transition')
    // Let the pressed button paint before the browser starts its snapshot work.
    await new Promise(resolve => requestAnimationFrame(resolve))
    transition = document.startViewTransition(update)
    await transition.ready
    // CSS animations exist as soon as the snapshot groups are created. There
    // is no JS animation attachment step that can miss the transition lifetime.
    await transition.finished
  } catch {
    transition?.skipTransition()
    await update()
    await transition?.finished.catch(() => {})
  } finally {
    if (previousName) root.style.setProperty('view-transition-name', previousName, previousPriority)
    else root.style.removeProperty('view-transition-name')
    root.classList.remove('theme-transition', 'theme-colors-instant')
    switchingTheme.value = false
    // Storage can block; write only after the visual transition has finished.
    rememberTheme(nextTheme)
  }
}

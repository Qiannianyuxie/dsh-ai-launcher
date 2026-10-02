/**
 * Smoke test for dsh-ai-launcher's browser half.
 *
 * Evaluates client.js exactly as the shell would (a classic script that calls
 * `window.__ModuleLoader__.load`), then drives the factory, `apply`, and the
 * tab body against a minimal React/ctx stand-in. It asserts wiring — the tab
 * type, the guide capsule, the slot registration, the locale keys, and the
 * rendered card grid — not pixels.
 *
 * Run: node scripts/smoke.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

let failures = 0
function check(label, condition) {
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}`)
  }
}

// ── a minimal React stand-in ────────────────────────────────────────────────
const hookState = { index: 0, slots: [] }
const React = {
  Fragment: Symbol('Fragment'),
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children: children.flat() }
  },
  useState(initial) {
    const i = hookState.index++
    if (hookState.slots[i] === undefined) {
      hookState.slots[i] = typeof initial === 'function' ? initial() : initial
    }
    return [hookState.slots[i], value => { hookState.slots[i] = value }]
  },
  useEffect() {},
}

function render(element) {
  if (element === null || element === undefined || element === false) return ''
  if (typeof element === 'string' || typeof element === 'number') return String(element)
  if (Array.isArray(element)) return element.map(render).join('')
  if (typeof element.type === 'function') {
    hookState.index = 0
    return render(element.type(element.props))
  }
  const own = Array.isArray(element.children) ? element.children.map(render).join('') : ''
  return `${own}`
}

function collect(element, out = []) {
  if (!element || typeof element !== 'object') return out
  if (Array.isArray(element)) { element.forEach(child => collect(child, out)); return out }
  out.push(element)
  if (typeof element.type === 'function') {
    hookState.index = 0
    collect(element.type(element.props), out)
  } else {
    collect(element.children, out)
  }
  return out
}

function walkText(element, out = []) {
  if (element === null || element === undefined || element === false) return out
  if (typeof element === 'string') { out.push(element); return out }
  if (Array.isArray(element)) { element.forEach(child => walkText(child, out)); return out }
  if (typeof element.type === 'function') {
    hookState.index = 0
    walkText(element.type(element.props), out)
  } else {
    walkText(element.children, out)
  }
  return out
}

// ── evaluate the bundle the way the shell does ──────────────────────────────
let registration = null
globalThis.window = {
  __ModuleLoader__: { load: value => { registration = value } },
}
globalThis.localStorage = (() => {
  const store = new Map()
  return {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  }
})()
// Recorded, not performed: the fallback arm must be observable.
globalThis.open = url => { calls.windowOpen.push(url); return null }

new Function('window', source)(globalThis.window)

console.log('bundle shape')
check('load() was called', registration !== null)
check('id equals the package name', registration?.id === 'dsh-ai-launcher')
check('factory is a function', typeof registration?.factory === 'function')

const moduleExports = registration.factory(name => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})
check('exports an inject list', Array.isArray(moduleExports.inject))
check('inject names the sidebar services', moduleExports.inject.includes('sidebarRight') && moduleExports.inject.includes('sidebarRightTabs'))
check('inject names slots + locale', moduleExports.inject.includes('slots') && moduleExports.inject.includes('locale'))
check('exports apply()', typeof moduleExports.apply === 'function')

// ── a minimal ctx stand-in ──────────────────────────────────────────────────
/**
* `browserRegistered` toggles whether the shipped Browser tab type exists, so
* both arms of the opening strategy can be exercised. `openTab` throws the same
* error the real controller throws for an unregistered kind, which is exactly
* what the plugin's fallback path is written against.
*/
let browserRegistered = false
const calls = { openTab: [], windowOpen: [] }
const registered = { types: [], slots: [], dictionaries: [], effects: [] }
const ctx = {
  locale: {
    bind: ns => key => `${ns}:${key}`,
    register: (ns, dict) => { registered.dictionaries.push({ ns, dict }); return () => {} },
  },
  sidebarRightTabs: {
    register: definition => { registered.types.push(definition); return () => {} },
    get: kind => (kind === 'browser' && browserRegistered ? { kind } : undefined),
  },
  sidebarRight: {
    openTab: (kind, options) => {
      if (kind === 'browser' && !browserRegistered) {
        throw new Error(`sidebarRight: no tab type is registered as "${kind}"`)
      }
      calls.openTab.push({ kind, options })
    },
  },
  slots: {
    inject: (name, factory) => { registered.slots.push({ name, produced: factory() }); return () => {} },
    register: (options, component) => { registered.slots.push({ options, component }); return () => {} },
  },
  effect: (fn, label) => { registered.effects.push(label); return fn() },
}

console.log('\napply')
moduleExports.apply(ctx)
check('locale dictionary registered', registered.dictionaries.length === 1 && registered.dictionaries[0].ns === 'aiLauncher')
check('tab type registered', registered.types.length === 1)
const definition = registered.types[0]
check('tab type id', definition?.id === 'dsh-ai-launcher')
check('tab type kind', definition?.kind === 'ai-launcher')
check('tab type has a title()', typeof definition?.title === 'function')
check('guide capsule present', Array.isArray(definition?.guide) && definition.guide.length === 1)
const capsule = definition?.guide?.[0]
check('guide capsule has order + icon', capsule?.order === 40 && typeof capsule?.icon === 'function')
check('guide title/description are locale-live', typeof capsule?.title === 'function' && typeof capsule?.description === 'function')
check('body registered on the keyed seat', registered.slots.some(s => s.options?.name === 'sidebar.right.pane.tab' && s.options?.key === 'dsh-ai-launcher'))
check('body registered with the locale namespace', registered.slots.some(s => s.options?.locale === 'aiLauncher'))

const body = registered.slots.find(s => s.options?.key === 'dsh-ai-launcher')?.component
check('body is a component', typeof body === 'function')

const translate = key => key

/** Re-render the body from a clean hook slate, as React would on a fresh mount. */
function mount() {
  hookState.slots.length = 0
  hookState.index = 0
  return body({ t: translate })
}

/** The rendered card div for one site id (the Card element precedes its output). */
function cardFor(tree, siteId) {
  const all = collect(tree)
  const start = all.findIndex(n => n.props?.site?.id === siteId)
  if (start < 0) return null
  for (let i = start + 1; i < all.length; i += 1) {
    if (all[i].props?.className === 'dshAilCard') return all[i]
  }
  return null
}

/**
* The remove button belonging to one site id.
*
* `collect` emits the Card element and then its whole rendered subtree, and two
* nested nodes share the shapes you might naively bound on: the card div itself
* carries `dshAilCard`, and `Glyph` also receives `props.site`. So anchor on the
* card div, then stop at the *next* card div.
*/
function removeFor(tree, siteId) {
  const all = collect(tree)
  const start = all.findIndex(n => n.props?.site?.id === siteId)
  if (start < 0) return null
  const divStart = all.findIndex((n, i) => i >= start && n.props?.className === 'dshAilCard')
  if (divStart < 0) return null
  for (let i = divStart + 1; i < all.length; i += 1) {
    if (all[i].props?.className === 'dshAilCard') return null
    if (all[i].props?.['aria-label'] === 'remove') return all[i]
  }
  return null
}

/** A head-row button identified by its rendered label. */
function headButton(tree, label) {
  return collect(tree).find(n =>
    n.props?.className === 'dshAilAdd'
    && walkText(n).join('').includes(label)) ?? null
}

/** Count of site cards currently on screen. */
function cardCount(tree) {
  return collect(tree).filter(n => n.props?.className === 'dshAilCard').length
}

// ── render the body, Browser tab type absent ────────────────────────────────
console.log('\nbody render — Browser tab type absent')
browserRegistered = false
let tree
try {
  tree = mount()
} catch (error) {
  tree = null
  check(`body renders without throwing (${error.message})`, false)
}
check('body renders a tree', tree !== null && tree !== undefined)

const nodes = collect(tree)
const text = walkText(tree).join(' | ')
console.log(`  text: ${text.slice(0, 240)}`)

const buttons = nodes.filter(n => n.props?.type === 'button')
const cards = nodes.filter(n => n.props?.className === 'dshAilCard')
check('renders 12 built-in cards', cards.length === 12)
check('renders an add control', buttons.some(b => b.props.className === 'dshAilAdd'))
check('hints at the external fallback when no Sidebar surface exists',
  text.includes('hintExternal') && !text.includes('hintSidebar'))
check('no external corner button when the primary click is already external',
  !buttons.some(b => b.props.className === 'dshAilMini' && b.props['aria-label'] === 'external'))
check('every card is removable, built-ins included',
  nodes.filter(n => n.props?.['aria-label'] === 'remove').length === 12)
check('title present', text.includes('title'))
check('site names present', text.includes('DeepSeek') && text.includes('豆包') && text.includes('ChatGPT') && text.includes('通义千问'))
check('hostnames present', text.includes('chat.deepseek.com'))
check('no restore control while nothing is hidden', headButton(tree, 'restore') === null)

// ── primary click falls back to a new tab without the Browser type ──────────
console.log('\nopening — fallback arm')
calls.windowOpen.length = 0
calls.openTab.length = 0
cardFor(tree, 'deepseek').props.onClick()
check('click opens a new browser tab',
  calls.windowOpen.length === 1 && calls.windowOpen[0] === 'https://chat.deepseek.com/')
check('click did not call openTab', calls.openTab.length === 0)

// ── Browser tab type present: primary click must go to the Sidebar ──────────
console.log('\nopening — sidebar arm')
browserRegistered = true
const treeSidebar = mount()
const sidebarText = walkText(treeSidebar).join(' | ')
check('hint switches to the sidebar wording',
  sidebarText.includes('hintSidebar') && !sidebarText.includes('hintExternal'))
check('corner gains an external escape hatch',
  collect(treeSidebar).some(n => n.props?.['aria-label'] === 'external'))

calls.windowOpen.length = 0
calls.openTab.length = 0
cardFor(treeSidebar, 'deepseek').props.onClick()
check('primary click opens in the Sidebar browser tab',
  calls.openTab.length === 1
  && calls.openTab[0].kind === 'browser'
  && calls.openTab[0].options?.params?.url === 'https://chat.deepseek.com/')
check('primary click did not open an external tab', calls.windowOpen.length === 0)

calls.windowOpen.length = 0
calls.openTab.length = 0
collect(treeSidebar).find(n => n.props?.['aria-label'] === 'external').props.onClick()
check('corner button opens externally instead',
  calls.windowOpen.length === 1 && calls.openTab.length === 0)

// ── built-in deletion, persistence, and restore ─────────────────────────────
console.log('\nbuilt-in removal and restore')
const key = 'dsh-ai-launcher.v1'
globalThis.localStorage.setItem(key, JSON.stringify({ custom: [], removed: [] }))
let treeBuiltins = mount()
check('starts with all 12 built-ins', cardCount(treeBuiltins) === 12)

removeFor(treeBuiltins, 'chatgpt').props.onClick()
const afterRemove = JSON.parse(globalThis.localStorage.getItem(key))
check('deleting a built-in persists its id',
  Array.isArray(afterRemove.removed) && afterRemove.removed.includes('chatgpt'))

treeBuiltins = mount()
check('deleted built-in is hidden', cardCount(treeBuiltins) === 11
  && !walkText(treeBuiltins).join('|').includes('ChatGPT'))
check('restore control appears once something is hidden',
  headButton(treeBuiltins, 'restore') !== null)

headButton(treeBuiltins, 'restore').props.onClick()
const afterRestore = JSON.parse(globalThis.localStorage.getItem(key))
check('restore clears the hidden list',
  Array.isArray(afterRestore.removed) && afterRestore.removed.length === 0)
check('deleted built-in comes back', cardCount(mount()) === 12)

// ── legacy payload (array shape) still loads custom sites ───────────────────
console.log('\nlegacy array payload')
globalThis.localStorage.setItem(key, JSON.stringify([
  { id: 'custom:https://example.com/', name: 'Example', url: 'https://example.com/', glyph: 'EX', color: '#6B7280' },
]))
const treeLegacy = mount()
check('custom site rendered above the built-ins',
  walkText(treeLegacy).join('|').includes('Example'))
check('custom site exposes a remove control',
  removeFor(treeLegacy, 'custom:https://example.com/') !== null)

// ── a custom site stays deletable, and deletion is permanent ────────────────
console.log('\ncustom site deletion')
removeFor(treeLegacy, 'custom:https://example.com/').props.onClick()
const afterCustom = JSON.parse(globalThis.localStorage.getItem(key))
check('custom deletion removes it from storage',
  Array.isArray(afterCustom.custom) && afterCustom.custom.length === 0)
check('custom site is gone from the grid',
  !walkText(mount()).join('|').includes('Example'))

// ── malformed storage degrades instead of throwing ──────────────────────────
console.log('\nmalformed storage')
globalThis.localStorage.setItem(key, '{not json')
let treeBad = null
try { treeBad = mount() } catch (error) { /* reported below */ }
check('malformed storage degrades instead of throwing', treeBad !== null)
// Degraded means "back to defaults", not "blank": an unreadable payload must
// never take the built-in roster down with it.
check('malformed storage falls back to the built-in roster',
  treeBad !== null && cardCount(treeBad) === 12)

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)

/**
 * dsh-ai-launcher — browser half.
 *
 * Contributes exactly one thing to the Web shell: a right-Sidebar tab type whose
 * body is a grid of well-known AI chat sites, one click each.
 *
 * Opening strategy — the panel lives in the Sidebar, so the Sidebar is where a
 * site opens. Primary click routes through `ctx.sidebarRight.openTab("browser",
 * …)`, the same call the shipped Browser tab uses, which puts the site beside
 * the conversation instead of stealing focus to another window.
 *
 * That leaves two gaps, each closed without ever offering a dead control:
 *   - The Browser tab type (`ui-sidebar-browser`) may be absent — it ships
 *     disabled in the Web profile. Then there is no Sidebar surface to open in,
 *     so the primary click degrades to a plain `window.open` new tab.
 *   - A site may refuse to render inside a frame (`X-Frame-Options` /
 *     `frame-ancestors`), which most of these vendors ship. So whenever the
 *     Sidebar path is the primary one, every card grows a corner escape hatch
 *     that opens the same URL in the system browser. The corner button only
 *     appears when it offers something the primary click does not.
 *
 * Persisted state — one `localStorage` key holding `{ custom, removed }`:
 * the user's own sites, plus the ids of built-in sites they deleted. A payload
 * written by the earlier array-only shape is read as "no deletions", so
 * upgrading never loses custom entries.
 *
 * Hand-written ModuleLoader bundle: no build step, no dependency beyond the
 * `react` the shell already provides. All chrome colour comes from theme
 * variables so the panel survives a scheme switch; only the site glyphs carry
 * fixed brand colour, which is artwork rather than chrome.
 */
window.__ModuleLoader__.load({
  id: 'dsh-ai-launcher',
  factory: require => {
    const React = require('react')
    const { createElement: h, Fragment, useState, useEffect } = React

    const ID = 'dsh-ai-launcher'
    const KIND = 'ai-launcher'
    const NS = 'aiLauncher'
    const STORE_KEY = 'dsh-ai-launcher.v1'

    /** Sidebar services the tab type is registered against. */
    const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs']

    // ── copy ────────────────────────────────────────────────────────────────
    const DICT = {
      zh: {
        'type.label': 'AI 网页',
        'guide.title': 'AI 网页',
        'guide.description': '一键打开常用 AI 网页版',
        title: 'AI 网页版',
        hintSidebar: '点击卡片在侧栏中打开；角落图标改为在系统浏览器打开。',
        hintExternal: '点击卡片在新标签页打开。',
        add: '添加站点',
        'add.name': '名称',
        'add.url': '网址',
        'add.save': '保存',
        'add.cancel': '取消',
        'add.error.name': '请填写名称。',
        'add.error.url': '请填写有效的 http(s) 网址。',
        'add.error.dup': '这个网址已经存在了。',
        remove: '删除',
        external: '在系统浏览器中打开',
        restore: '恢复默认',
        empty: '列表为空，点「恢复默认」找回内置站点。',
      },
      en: {
        'type.label': 'AI Sites',
        'guide.title': 'AI Sites',
        'guide.description': 'Open popular AI chat sites in one click',
        title: 'AI chat on the web',
        hintSidebar: 'Click a card to open it in the sidebar; the corner icon opens it in your browser instead.',
        hintExternal: 'Click a card to open it in a new tab.',
        add: 'Add a site',
        'add.name': 'Name',
        'add.url': 'URL',
        'add.save': 'Save',
        'add.cancel': 'Cancel',
        'add.error.name': 'Enter a name.',
        'add.error.url': 'Enter a valid http(s) URL.',
        'add.error.dup': 'That URL is already in the list.',
        remove: 'Remove',
        external: 'Open in system browser',
        restore: 'Restore defaults',
        empty: 'The list is empty — use "Restore defaults" to bring the built-ins back.',
      },
    }

    // ── roster ──────────────────────────────────────────────────────────────
    /**
    * The shipped roster. Deleting a built-in only hides it: the id is recorded
    * in `removed`, so the card comes back on "Restore defaults".
    */
    const BUILTIN = [
      { id: 'deepseek', name: 'DeepSeek', url: 'https://chat.deepseek.com/', color: '#4D6BFE', glyph: '深' },
      { id: 'doubao', name: '豆包', url: 'https://www.doubao.com/chat/', color: '#3259E1', glyph: '豆' },
      { id: 'qwen', name: '通义千问', url: 'https://www.tongyi.com/', color: '#615CED', glyph: '千' },
      { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', color: '#10A37F', glyph: 'GPT' },
      { id: 'kimi', name: 'Kimi', url: 'https://www.kimi.com/', color: '#1F1F1F', glyph: 'K' },
      { id: 'glm', name: '智谱清言', url: 'https://chatglm.cn/', color: '#3859FF', glyph: '智' },
      { id: 'yuanbao', name: '腾讯元宝', url: 'https://yuanbao.tencent.com/', color: '#0052D9', glyph: '元' },
      { id: 'yiyan', name: '文心一言', url: 'https://yiyan.baidu.com/', color: '#2932E1', glyph: '文' },
      { id: 'claude', name: 'Claude', url: 'https://claude.ai/new', color: '#D97757', glyph: 'Cl' },
      { id: 'gemini', name: 'Gemini', url: 'https://gemini.google.com/app', color: '#4285F4', glyph: 'Ge' },
      { id: 'copilot', name: 'Copilot', url: 'https://copilot.microsoft.com/', color: '#0F6CBD', glyph: 'Co' },
      { id: 'grok', name: 'Grok', url: 'https://grok.com/', color: '#1A1A1A', glyph: 'Gr' },
    ]

    /** Site glyph tile: brand colour is artwork, so it is not theme-derived. */
    function Glyph({ site }) {
      return h('span', {
        className: 'dshAilGlyph',
        style: { background: site.color },
        'aria-hidden': 'true',
      }, site.glyph)
    }

    /** Guide capsule artwork — a launch pad, drawn inline so nothing is fetched. */
    function GuideArtwork({ size }) {
      const s = size === undefined ? 26 : size
      return h('svg', { viewBox: '0 0 24 24', width: s, height: s, fill: 'none', 'aria-hidden': 'true' },
        h('path', { d: 'M12 3.2c3.1 2 4.8 5.1 4.8 8.7v3.4l1.6 1.6H5.6L7.2 15.3v-3.4c0-3.6 1.7-6.7 4.8-8.7Z', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round' }),
        h('circle', { cx: 12, cy: 10.6, r: 1.9, stroke: 'currentColor', strokeWidth: 1.5 }),
        h('path', { d: 'M9.4 18.6 8 21.4l2.6-1.1M14.6 18.6 16 21.4l-2.6-1.1', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    // ── storage ─────────────────────────────────────────────────────────────
    /**
    * Read persisted state; any malformed payload degrades to a clean slate.
    *
    * An older build stored a bare array of custom sites under the same key.
    * Reading that shape as `{ custom, removed: [] }` keeps those entries instead
    * of discarding them, so upgrading the plugin loses nothing.
    */
    function loadState() {
      try {
        const raw = globalThis.localStorage.getItem(STORE_KEY)
        if (typeof raw !== 'string' || raw === '') return { custom: [], removed: [] }
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return { custom: parsed.filter(isSite), removed: [] }
        if (parsed === null || typeof parsed !== 'object') return { custom: [], removed: [] }
        return {
          custom: Array.isArray(parsed.custom) ? parsed.custom.filter(isSite) : [],
          removed: Array.isArray(parsed.removed)
            ? [...new Set(parsed.removed.filter(id => typeof id === 'string' && id !== ''))]
            : [],
        }
      } catch (error) {
        return { custom: [], removed: [] }
      }
    }

    /** Whether one stored entry is a usable custom site. */
    function isSite(entry) {
      return entry !== null
        && typeof entry === 'object'
        && typeof entry.name === 'string'
        && typeof entry.url === 'string'
        && entry.name !== ''
        && entry.url !== ''
    }

    /** Persist state; a storage failure keeps the session's copy authoritative. */
    function saveState(state) {
      try {
        globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(state))
      } catch (error) {
        // Private mode or a full quota: the in-memory copy stays authoritative.
      }
    }

    /** Accept a bare host as https://; reject anything that is not http(s). */
    function normalizeUrl(input) {
      const value = String(input == null ? '' : input).trim()
      if (value === '') return null
      const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
      try {
        const parsed = new URL(withScheme)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
        if (parsed.hostname.length < 3 || !parsed.hostname.includes('.')) return null
        return parsed.href
      } catch (error) {
        return null
      }
    }

    /** Hostname without the leading www, for the card's second line. */
    function hostOf(url) {
      try {
        return new URL(url).hostname.replace(/^www\./, '')
      } catch (error) {
        return url
      }
    }

    /** First characters of the name, used as a neutral glyph for custom sites. */
    function glyphFor(name) {
      const trimmed = String(name).trim()
      if (trimmed === '') return '?'
      return trimmed.slice(0, trimmed.charCodeAt(0) > 255 ? 1 : 2).toUpperCase()
    }

    // ── shared wiring, read by the body from this factory's closure ─────────
    /** `ctx` of the running plugin; null until `apply` runs. */
    let wired = null

    /**
    * Whether the shipped Browser tab type is registered right now.
    *
    * Probed per render instead of once at apply: plugin activation order is not
    * fixed, so a probe taken while this plugin applies can miss a type that
    * registers a moment later. A stale "false" would hide a working control.
    */
    function sidebarBrowserReady() {
      if (wired === null) return false
      try {
        return wired.sidebarRightTabs.get('browser') !== undefined
      } catch (error) {
        return false
      }
    }

    /**
    * Open a site where the panel promised: the Sidebar's Browser tab.
    *
    * The whole point of the panel is that the site lands next to the
    * conversation. Falling back to a new browser tab is not a second mode, it is
    * the failure path — the Browser tab type is not registered, or no Session is
    * on screen — and it exists so a click is never swallowed.
    */
    function openSite(url) {
      if (wired === null) {
        openExternally(url)
        return
      }
      try {
        wired.sidebarRight.openTab('browser', { params: { url } })
      } catch (error) {
        openExternally(url)
      }
    }

    /** Open a site in a new browser tab — the corner escape hatch. */
    function openExternally(url) {
      globalThis.open(url, '_blank', 'noopener,noreferrer')
    }

    // ── the panel ───────────────────────────────────────────────────────────
    const CSS = `
.dshAilRoot{display:flex;flex-direction:column;gap:12px;height:100%;min-height:0;padding:14px;overflow:auto;box-sizing:border-box;font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary)}
.dshAilHead{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.dshAilHeadActions{display:flex;align-items:center;gap:6px}
.dshAilTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary);margin:0}
.dshAilHint{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary);margin:0}
.dshAilAdd{flex:none;padding:4px 10px;font:inherit;font-size:12px;border-radius:var(--dsw-radius-md);color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l3);cursor:pointer}
.dshAilAdd:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshAilAdd:focus-visible{outline:2px solid var(--dsw-focus-ring-color);outline-offset:1px}
.dshAilGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px;align-content:start}
.dshAilCard{position:relative;display:flex;align-items:center;gap:9px;min-width:0;padding:10px;text-align:left;font:inherit;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);cursor:pointer}
.dshAilCard:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}
.dshAilCard:focus-visible{outline:2px solid var(--dsw-focus-ring-color);outline-offset:1px}
.dshAilGlyph{flex:none;display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9px;color:#fff;font-size:12px;font-weight:600;letter-spacing:.02em}
.dshAilText{min-width:0;display:flex;flex-direction:column;gap:2px}
.dshAilName{font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshAilHost{font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dshAilCorner{position:absolute;top:4px;right:4px;display:flex;gap:2px;opacity:0;transition:opacity .12s ease}
.dshAilCard:hover .dshAilCorner,.dshAilCard:focus-within .dshAilCorner{opacity:1}
.dshAilMini{display:flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:6px;color:var(--dsw-alias-label-secondary);background:transparent;cursor:pointer}
.dshAilMini:hover{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}
.dshAilMini:focus-visible{opacity:1;outline:2px solid var(--dsw-focus-ring-color);outline-offset:1px}
.dshAilForm{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg)}
.dshAilInput{flex:1 1 120px;min-width:0;padding:6px 9px;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md)}
.dshAilInput::placeholder{color:var(--dsw-alias-label-tertiary)}
.dshAilInput:focus-visible{outline:2px solid var(--dsw-focus-ring-color);outline-offset:-1px}
.dshAilBtn{padding:6px 12px;font:inherit;font-size:12.5px;border-radius:var(--dsw-radius-md);cursor:pointer;border:1px solid transparent}
.dshAilBtnPrimary{color:var(--dsw-alias-label-primary-foreground);background:var(--dsw-alias-button-primary-fill)}
.dshAilBtnPrimary:hover{background:var(--dsw-alias-button-primary-hover)}
.dshAilBtnGhost{color:var(--dsw-alias-label-secondary);background:transparent;border-color:var(--dsw-alias-border-l3)}
.dshAilBtnGhost:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshAilBtn:focus-visible{outline:2px solid var(--dsw-focus-ring-color);outline-offset:1px}
.dshAilError{flex:1 1 100%;font-size:11.5px;color:var(--dsw-alias-label-error);margin:0}
.dshAilEmpty{font-size:12px;color:var(--dsw-alias-label-tertiary);margin:0}
`

    /**
    * One site card.
    *
    * The whole card is the primary action. The corner holds at most two
    * buttons, and each earns its place: the external one is rendered only when
    * the primary click is going to the Sidebar (otherwise it would duplicate
    * it), and the delete one is always available so built-ins are removable too.
    */
    function Card({ site, sidebarReady, t, onOpen, onExternal, onRemove }) {
      return h('div', {
        className: 'dshAilCard',
        role: 'button',
        tabIndex: 0,
        title: site.url,
        onClick: () => onOpen(site.url),
        onKeyDown: event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen(site.url)
          }
        },
      },
      h(Glyph, { site }),
      h('span', { className: 'dshAilText' },
        h('span', { className: 'dshAilName' }, site.name),
        h('span', { className: 'dshAilHost' }, hostOf(site.url))),
      h('span', { className: 'dshAilCorner', onClick: event => event.stopPropagation(), onKeyDown: event => event.stopPropagation() },
        sidebarReady
          ? h('button', {
            type: 'button',
            className: 'dshAilMini',
            title: t('external'),
            'aria-label': t('external'),
            onClick: () => onExternal(site.url),
          }, h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, fill: 'none', 'aria-hidden': 'true' },
            h('path', { d: 'M6.5 3.5h-3v9h9v-3M9.5 3.5h3v3M12.5 3.5 7.5 8.5', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' })))
          : null,
        h('button', {
          type: 'button',
          className: 'dshAilMini',
          title: t('remove'),
          'aria-label': t('remove'),
          onClick: () => onRemove(site.id),
        }, h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, fill: 'none', 'aria-hidden': 'true' },
          h('path', { d: 'M4.5 4.5l7 7M11.5 4.5l-7 7', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' })))))
    }

    /** The tab body: the roster grid, plus controls for adding and restoring. */
    function AiLauncherBody({ t }) {
      const translate = typeof t === 'function' ? t : key => key
      const [state, setState] = useState(loadState)
      const [adding, setAdding] = useState(false)
      const [name, setName] = useState('')
      const [url, setUrl] = useState('')
      const [error, setError] = useState('')
      // Re-probed on a tick: the Browser tab type can register after this body
      // first paints, and a stale "false" would route every click the wrong way.
      const [sidebarReady, setSidebarReady] = useState(() => sidebarBrowserReady())

      useEffect(() => {
        if (sidebarReady) return undefined
        const timer = setInterval(() => {
          if (sidebarBrowserReady()) setSidebarReady(true)
        }, 1000)
        return () => clearInterval(timer)
      }, [sidebarReady])

      /** Move one record to memory and to storage together, so they cannot drift. */
      const commit = next => {
        setState(next)
        saveState(next)
      }

      const { custom, removed } = state
      const hidden = new Set(removed)
      const sites = [...custom, ...BUILTIN.filter(site => !hidden.has(site.id))]

      const submit = event => {
        event.preventDefault()
        const trimmedName = name.trim()
        if (trimmedName === '') {
          setError(translate('add.error.name'))
          return
        }
        const normalized = normalizeUrl(url)
        if (normalized === null) {
          setError(translate('add.error.url'))
          return
        }
        // Compare against what is actually on screen: a built-in the user
        // deleted may legitimately be re-added as their own entry.
        if (sites.some(site => site.url.replace(/\/$/, '') === normalized.replace(/\/$/, ''))) {
          setError(translate('add.error.dup'))
          return
        }
        const entry = { id: `custom:${normalized}`, name: trimmedName, url: normalized, color: '#6B7280', glyph: glyphFor(trimmedName) }
        commit({ ...state, custom: [...custom, entry] })
        setName('')
        setUrl('')
        setError('')
        setAdding(false)
      }

      /**
      * Deleting a built-in only hides it — the id goes to `removed`, which is
      * exactly the list "Restore defaults" clears. Custom sites are deleted for
      * good, since the user typed them and can retype them.
      */
      const remove = id => {
        if (id.startsWith('custom:')) {
          commit({ ...state, custom: custom.filter(site => site.id !== id) })
          return
        }
        if (hidden.has(id)) return
        commit({ ...state, removed: [...removed, id] })
      }

      const restore = () => commit({ ...state, removed: [] })

      const renderCard = site => h(Card, {
        key: site.id,
        site,
        sidebarReady,
        t: translate,
        onOpen: openSite,
        onExternal: openExternally,
        onRemove: remove,
      })

      return h('div', { className: 'dshAilRoot' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('div', { className: 'dshAilHead' },
          h('h3', { className: 'dshAilTitle' }, translate('title')),
          h('span', { className: 'dshAilHeadActions' },
            removed.length > 0
              ? h('button', {
                type: 'button',
                className: 'dshAilAdd',
                onClick: restore,
              }, translate('restore'))
              : null,
            h('button', {
              type: 'button',
              className: 'dshAilAdd',
              onClick: () => { setAdding(value => !value); setError('') },
            }, adding ? translate('add.cancel') : translate('add')))),
        h('p', { className: 'dshAilHint' }, translate(sidebarReady ? 'hintSidebar' : 'hintExternal')),
        adding
          ? h('form', { className: 'dshAilForm', onSubmit: submit },
            h('input', {
              className: 'dshAilInput',
              type: 'text',
              value: name,
              placeholder: translate('add.name'),
              'aria-label': translate('add.name'),
              onChange: event => { setName(event.target.value); setError('') },
            }),
            h('input', {
              className: 'dshAilInput',
              type: 'text',
              value: url,
              placeholder: translate('add.url'),
              'aria-label': translate('add.url'),
              onChange: event => { setUrl(event.target.value); setError('') },
            }),
            h('button', { type: 'submit', className: 'dshAilBtn dshAilBtnPrimary' }, translate('add.save')),
            h('button', {
              type: 'button',
              className: 'dshAilBtn dshAilBtnGhost',
              onClick: () => { setAdding(false); setError(''); setName(''); setUrl('') },
            }, translate('add.cancel')),
            error === '' ? null : h('p', { className: 'dshAilError' }, error))
          : null,
        sites.length > 0
          ? h('div', { className: 'dshAilGrid' }, sites.map(renderCard))
          : h('p', { className: 'dshAilEmpty' }, translate('empty')))
    }

    // ── registration ────────────────────────────────────────────────────────
    /** The tab type: one page, one guide capsule. */
    function tabDefinition(t) {
      return {
        id: ID,
        kind: KIND,
        title: () => t('type.label'),
        guide: [{
          id: 'open',
          order: 40,
          title: () => t('guide.title'),
          description: () => t('guide.description'),
          icon: GuideArtwork,
        }],
      }
    }

    return {
      inject,
      apply(ctx) {
        // Bound before anything registers: the body can render the moment the
        // tab opens, and it reads `wired` to route every click.
        wired = ctx
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, DICT), 'dsh-ai-launcher: dictionaries')
        ctx.effect(() => ctx.sidebarRightTabs.register(tabDefinition(t)), 'dsh-ai-launcher: tab type')
        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: ID,
          locale: NS,
        }, AiLauncherBody)), 'dsh-ai-launcher: tab body')
      },
    }
  },
})

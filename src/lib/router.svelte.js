/**
 * Hash router, about forty lines.
 *
 * Hash routing rather than the History API because the app is deployed as static
 * files on GitHub Pages, where a deep link to /quiz would 404 before any
 * JavaScript could claim it. `#/quiz` always resolves to index.html.
 */

class Router {
  /** @type {string} */ path = $state('/')
  /** @type {string[]} */ segments = $state([])
  /** @type {URLSearchParams} */ query = $state(new URLSearchParams())

  constructor() {
    this.sync()
    window.addEventListener('hashchange', () => this.sync())
  }

  sync() {
    const raw = (location.hash || '#/').slice(1)
    const [path, search = ''] = raw.split('?')
    this.path = path || '/'
    this.segments = this.path.split('/').filter(Boolean)
    this.query = new URLSearchParams(search)
    window.scrollTo(0, 0)
  }

  /** @returns {string} the first segment, which selects the view */
  get view() {
    return this.segments[0] ?? 'dashboard'
  }

  /** @param {string} to */
  go(to) {
    location.hash = to.startsWith('#') ? to : '#' + to
  }
}

export const router = new Router()

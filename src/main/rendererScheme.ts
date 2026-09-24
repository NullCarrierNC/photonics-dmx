import { readFile, realpath, stat } from 'fs/promises'
import { extname, isAbsolute, join, relative, resolve } from 'path'
import { app, protocol } from 'electron'

/**
 * The scheme a built renderer loads from. A page under file:// can read any local file its script
 * asks for, and a page under this scheme reaches the built renderer folder and nothing else.
 */
const RENDERER_SCHEME = 'photonics'
const RENDERER_HOST = 'renderer'

/** Content types for what the build writes into out/renderer. */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
}

/** The built renderer's entry page, with the `window` query that picks which page it shows. */
export function rendererPageUrl(windowQuery?: string): string {
  const entry = `${RENDERER_SCHEME}://${RENDERER_HOST}/index.html`
  return windowQuery ? `${entry}?window=${encodeURIComponent(windowQuery)}` : entry
}

/** Whether `path` sits inside `root`, both absolute. */
function isInside(root: string, path: string): boolean {
  const inside = relative(root, path)
  return inside !== '' && !inside.startsWith('..') && !isAbsolute(inside)
}

/**
 * The file a renderer URL names under `rendererDir`, or null for another scheme or host, an
 * encoded separator, or a path that leaves the folder.
 */
export function rendererFileFor(url: string, rendererDir: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== `${RENDERER_SCHEME}:` || parsed.host !== RENDERER_HOST) {
    return null
  }
  // The URL parser has resolved every `..` it can see. An encoded slash or backslash would turn
  // into a separator only once decoded, so it is refused rather than decoded.
  if (/%2f|%5c/i.test(parsed.pathname)) {
    return null
  }
  let pathname: string
  try {
    pathname = decodeURIComponent(parsed.pathname)
  } catch {
    return null
  }
  if (pathname.includes('\0') || pathname.includes('\\')) {
    return null
  }
  const root = resolve(rendererDir)
  const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
  return isInside(root, file) ? file : null
}

function notFound(): Response {
  return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })
}

/**
 * The response to one request on the scheme: the file with its content type, or 404 for anything
 * that is not a file inside `rendererDir`, a link that points out of it included.
 */
export async function rendererResponse(url: string, rendererDir: string): Promise<Response> {
  const file = rendererFileFor(url, rendererDir)
  if (file === null) {
    return notFound()
  }
  try {
    const real = await realpath(file)
    if (!isInside(await realpath(rendererDir), real) || !(await stat(real)).isFile()) {
      return notFound()
    }
    const type = CONTENT_TYPES[extname(real).toLowerCase()] ?? 'application/octet-stream'
    return new Response(await readFile(real), { status: 200, headers: { 'content-type': type } })
  } catch {
    return notFound()
  }
}

/**
 * Serves the scheme from the built renderer folder beside the main bundle. The scheme is
 * registered here, before `ready`, as Electron requires, and handled once the app is ready.
 */
export function serveRendererFromScheme(rendererDir = join(__dirname, '../renderer')): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: RENDERER_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ])
  app.once('ready', () => {
    protocol.handle(RENDERER_SCHEME, (request) => rendererResponse(request.url, rendererDir))
  })
}

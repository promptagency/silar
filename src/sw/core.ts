// Pure parts of the service worker (src/sw/sw.ts), kept apart for testing.
// Copied from Skrubba's src/sw/core.ts, with Silar's own precache rule.

/** URL path → content revision. Written into sw.js at build time, from the files in dist/. */
export type SwManifest = Record<string, string>;

export const cacheKey = (path: string, rev: string) => `${path}?__rev=${rev}`;

/** Message the page sends a new build that is still waiting, to make it take over. */
export const SKIP_WAITING = "skip-waiting";

/** Where the service worker keeps the manifest it activated with, to know the previous build. */
export const MANIFEST_KEY = "/__sw-manifest";

/**
 * Files fetched on install: everything outside /assets/ (index.html, icons,
 * web manifest), the files index.html links (`shell`), and the woff2 fonts
 * Swedish text uses. Parser chunks and the pdf.js worker are cached the first
 * time a file of that type is opened, so a visitor who only converts Word
 * never downloads the PDF reader.
 */
export function precacheList(manifest: SwManifest, shell: string[]): string[] {
  return Object.keys(manifest).filter(
    (path) => !path.startsWith("/assets/") || shell.includes(path) || /-latin(-ext)?-\d+-normal-[\w-]+\.woff2$/.test(path),
  );
}

/** The /-paths index.html loads: scripts, stylesheets, icons, the web manifest. */
export function shellFiles(html: string): string[] {
  return [...html.matchAll(/\s(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
}

/**
 * Cached request URLs to delete on activate: anything that belongs neither to
 * this build nor to the previous one. The previous build's files stay one
 * more cycle, so a tab still running it never asks for a file that is gone.
 */
export function staleKeys(cachedUrls: string[], current: SwManifest, previous: SwManifest): string[] {
  return cachedUrls.filter((url) => {
    const { pathname, searchParams } = new URL(url);
    if (pathname === MANIFEST_KEY) return false;
    const rev = searchParams.get("__rev");
    return current[pathname] !== rev && previous[pathname] !== rev;
  });
}

/**
 * The URL to fetch a file from. The app shell is cached as /index.html but
 * fetched from /: Cloudflare Pages answers /index.html with a redirect to /,
 * and browsers refuse a redirected response from a service worker for a page
 * load, so returning visitors would get an error page.
 */
export const networkPath = (path: string) => (path === "/index.html" ? "/" : path);

/** A redirected response, copied so it no longer counts as redirected. A second guard for other hosts. */
export async function unredirected(res: Response): Promise<Response> {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
}

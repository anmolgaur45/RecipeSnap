export function isInstagramUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === 'instagram.com' || hostname === 'www.instagram.com';
  } catch {
    return false;
  }
}

export function getInstagramShortcode(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const match = pathname.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/);
    return match?.[2] ?? null;
  } catch {
    return null;
  }
}

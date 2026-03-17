export function isTikTokUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'tiktok.com' ||
      hostname === 'www.tiktok.com' ||
      hostname === 'vm.tiktok.com'
    );
  } catch {
    return false;
  }
}

export function getTikTokVideoId(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    const match = pathname.match(/\/video\/(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

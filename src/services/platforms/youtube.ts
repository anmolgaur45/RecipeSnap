export function isYouTubeUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'youtube.com' ||
      hostname === 'www.youtube.com' ||
      hostname === 'youtu.be'
    );
  } catch {
    return false;
  }
}

export function getYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const { hostname, pathname, searchParams } = parsed;
    if (hostname === 'youtu.be') return pathname.slice(1);
    return searchParams.get('v') ?? pathname.split('/').pop() ?? null;
  } catch {
    return null;
  }
}

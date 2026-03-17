// Utility helpers for video URL handling on the client side

export function extractVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const { hostname, pathname, searchParams } = parsed;

    if (hostname.includes('youtube.com')) {
      return searchParams.get('v') ?? pathname.split('/').pop() ?? null;
    }
    if (hostname.includes('youtu.be')) {
      return pathname.slice(1);
    }
    if (hostname.includes('tiktok.com')) {
      const match = pathname.match(/\/video\/(\d+)/);
      return match?.[1] ?? null;
    }
    if (hostname.includes('instagram.com')) {
      const match = pathname.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/);
      return match?.[2] ?? null;
    }
  } catch {
    // Invalid URL
  }
  return null;
}

export function getPlatformLabel(platform: string): string {
  const labels: Record<string, string> = {
    instagram: 'Instagram Reel',
    tiktok: 'TikTok',
    youtube: 'YouTube Short',
    unknown: 'Video',
  };
  return labels[platform] ?? 'Video';
}

export function getPlatformIcon(platform: string): string {
  const icons: Record<string, string> = {
    instagram: '📸',
    tiktok: '🎵',
    youtube: '▶️',
    unknown: '🎬',
  };
  return icons[platform] ?? '🎬';
}

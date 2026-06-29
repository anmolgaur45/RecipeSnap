// SSRF guard for user-submitted source URLs. The /extract URL is handed to
// yt-dlp, which will fetch whatever it is given, so we constrain it to the
// supported platforms before any network call. Anything else (internal hosts,
// IP literals, private ranges, odd protocols) is rejected at the API boundary.

const ALLOWED_HOST_SUFFIXES = [
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'youtu.be',
];

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

function isIpLiteral(hostname: string): boolean {
  // IPv4 dotted-quad, or anything with a colon (IPv6 / host:port leakage).
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

/**
 * Throws UnsafeUrlError unless `raw` is an https URL on a supported platform host.
 * Call before resolving/downloading a user-submitted URL.
 */
export function assertAllowedSourceUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UnsafeUrlError('Not a valid URL.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new UnsafeUrlError('Only http(s) URLs are supported.');
  }

  const host = parsed.hostname.toLowerCase();

  if (isIpLiteral(host)) {
    throw new UnsafeUrlError('IP-address URLs are not allowed.');
  }

  const allowed = ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
  if (!allowed) {
    throw new UnsafeUrlError('Unsupported source. Use an Instagram, TikTok, or YouTube link.');
  }
}

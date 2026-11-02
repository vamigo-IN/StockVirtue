/** YouTube or Vimeo link → { provider, videoId }; anything else → null. */
export function parseVideoUrl(
  raw: string,
): { provider: 'youtube' | 'vimeo'; videoId: string } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  const yt = (id: string | null | undefined) =>
    id && /^[A-Za-z0-9_-]{11}$/.test(id)
      ? { provider: 'youtube' as const, videoId: id }
      : null;
  if (host === 'youtu.be') return yt(url.pathname.slice(1).split('/')[0]);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') return yt(url.searchParams.get('v'));
    const m = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
    return yt(m?.[1]);
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = url.pathname.match(/(?:^|\/)(\d{6,12})(?:$|\/)/);
    return m ? { provider: 'vimeo', videoId: m[1] } : null;
  }
  return null;
}

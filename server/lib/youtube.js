const KEY = () => process.env.YOUTUBE_API_KEY;
const API = 'https://www.googleapis.com/youtube/v3';

export const youtubeConfigured = () => Boolean(KEY());

async function api(path, params) {
  if (!youtubeConfigured()) return null;
  const url = new URL(`${API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', KEY());
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.warn(`[youtube] ${path} returned ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[youtube] request failed:', err.message);
    return null;
  }
}

export function normaliseHandle(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^UC[\w-]{22}$/.test(raw)) return { channelId: raw };
  const urlMatch = raw.match(/youtube\.com\/(?:@|channel\/|c\/|user\/)([\w.-]+)/i);
  const handle = (urlMatch ? urlMatch[1] : raw).replace(/^@/, '').trim();
  if (!handle) return null;
  return /^UC[\w-]{22}$/.test(handle) ? { channelId: handle } : { handle };
}

export async function fetchChannel(handleInput) {
  const normalised = normaliseHandle(handleInput);
  if (!normalised) return null;
  const params = {
    part: 'snippet,statistics',
    ...(normalised.channelId ? { id: normalised.channelId } : { forHandle: `@${normalised.handle}` }),
  };
  const data = await api('channels', params);
  const item = data?.items?.[0];
  if (!item) return null;
  return {
    channelId: item.id,
    title: item.snippet?.title || '',
    description: (item.snippet?.description || '').slice(0, 400),
    thumbnail: item.snippet?.thumbnails?.default?.url || null,
    followers: Number(item.statistics?.subscriberCount || 0),
    totalViews: Number(item.statistics?.viewCount || 0),
    videoCount: Number(item.statistics?.videoCount || 0),
    hiddenSubscribers: Boolean(item.statistics?.hiddenSubscriberCount),
  };
}

export async function fetchRecentVideos(channelId, max = 10) {
  if (!youtubeConfigured() || !channelId) return [];
  const search = await api('search', {
    part: 'snippet',
    channelId,
    order: 'date',
    type: 'video',
    maxResults: String(Math.min(25, max)),
  });
  const ids = (search?.items || []).map((i) => i.id?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const videos = await api('videos', {
    part: 'snippet,statistics',
    id: ids.join(','),
  });
  return (videos?.items || []).map((v) => ({
    videoId: v.id,
    title: v.snippet?.title || '',
    publishedAt: v.snippet?.publishedAt || null,
    views: Number(v.statistics?.viewCount || 0),
    likes: Number(v.statistics?.likeCount || 0),
    comments: Number(v.statistics?.commentCount || 0),
    url: `https://www.youtube.com/watch?v=${v.id}`,
  }));
}

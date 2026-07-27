// api/lookup.js
// Fetches public Instagram profile data for a given username.
// Returns username, full_name, bio, followers, following, post count,
// avatar URL, verified status, private flag, and user ID.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username } = req.body || {};
  if (!username) {
    return res.status(400).json({ error: 'username required' });
  }

  const clean = username.replace(/^@/, '').toLowerCase().trim();

  try {
    // IG's web profile API — public endpoint, no auth required
    const igRes = await fetch(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`,
      {
        headers: {
          'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'X-IG-App-ID':     '936619743392459',
          'Accept':          'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer':         `https://www.instagram.com/${clean}/`,
          'Sec-Fetch-Site':  'same-origin',
          'Sec-Fetch-Mode':  'cors',
          'Sec-Fetch-Dest':  'empty'
        }
      }
    );

    if (igRes.status === 404) {
      return res.status(404).json({ error: `User @${clean} not found` });
    }

    if (igRes.status === 429) {
      return res.status(429).json({ error: 'Rate limited by Instagram. Try again in a moment.' });
    }

    if (!igRes.ok) {
      return res.status(502).json({ error: `Instagram returned HTTP ${igRes.status}` });
    }

    const data = await igRes.json();
    const u    = data?.data?.user;

    if (!u) {
      return res.status(404).json({ error: `User @${clean} not found` });
    }

    return res.status(200).json({
      id:         u.id,
      username:   u.username,
      full_name:  u.full_name,
      bio:        u.biography,
      avatar:     u.profile_pic_url_hd || u.profile_pic_url,
      followers:  u.edge_followed_by?.count ?? 0,
      following:  u.edge_follow?.count       ?? 0,
      posts:      u.edge_owner_to_timeline_media?.count ?? 0,
      verified:   u.is_verified   || false,
      is_private: u.is_private    || false,
      external_url: u.external_url || null
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username } = req.body || {};
  if (!username) return res.status(400).json({ error: 'username required' });

  const clean = username.replace(/^@/, '').toLowerCase().trim();

  try {
    const data = await igRequest(clean);
    const u    = data && data.data && data.data.user;

    if (!u) return res.status(404).json({ error: `User @${clean} not found` });

    return res.status(200).json({
      id:         u.id,
      username:   u.username,
      full_name:  u.full_name,
      bio:        u.biography,
      avatar:     u.profile_pic_url_hd || u.profile_pic_url,
      followers:  (u.edge_followed_by && u.edge_followed_by.count) || 0,
      following:  (u.edge_follow       && u.edge_follow.count)      || 0,
      posts:      (u.edge_owner_to_timeline_media && u.edge_owner_to_timeline_media.count) || 0,
      verified:   u.is_verified  || false,
      is_private: u.is_private   || false,
      external_url: u.external_url || null
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function igRequest(username) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.instagram.com',
      path:     `/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      method:   'GET',
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-IG-App-ID':     '936619743392459',
        'Accept':          'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         `https://www.instagram.com/${username}/`
      }
    };

    const req = https.request(options, (r) => {
      let body = '';
      r.on('data', chunk => body += chunk);
      r.on('end', () => {
        if (r.statusCode === 404) return reject(new Error(`User @${username} not found`));
        if (r.statusCode === 429) return reject(new Error('Rate limited by Instagram'));
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Invalid JSON from Instagram')); }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

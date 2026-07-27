const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionid } = req.body || {};
  if (!sessionid) return res.status(400).json({ error: 'sessionid required' });

  try {
    const data = await igRequest(
      'www.instagram.com',
      '/api/v1/accounts/current_user/?edit=true',
      sessionid
    );

    const user = data.user || {};
    return res.status(200).json({
      username:  user.username        || null,
      full_name: user.full_name       || null,
      avatar:    user.profile_pic_url || null,
      user_id:   user.pk              || null,
      verified:  user.is_verified     || false,
      private:   user.is_private      || false
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

function igRequest(host, path, sessionid) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      path,
      method: 'GET',
      headers: {
        'User-Agent':      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Cookie':          `sessionid=${sessionid}`,
        'X-IG-App-ID':     '936619743392459',
        'Accept':          'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer':         'https://www.instagram.com/'
      }
    };

    const req = https.request(options, (r) => {
      let body = '';
      r.on('data', chunk => body += chunk);
      r.on('end', () => {
        if (r.statusCode === 401 || r.statusCode === 403) {
          return reject(new Error('Session expired or invalid'));
        }
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('Invalid JSON from Instagram')); }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

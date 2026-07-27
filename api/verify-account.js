// api/verify-account.js
// Verifies an Instagram session ID and returns the account's username + avatar.
// Called when adding an account to the pool.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionid } = req.body || {};
  if (!sessionid) {
    return res.status(400).json({ error: 'sessionid required' });
  }

  try {
    // Hit IG's /accounts/current_user/ endpoint — requires valid session
    const igRes = await fetch('https://www.instagram.com/api/v1/accounts/current_user/?edit=true', {
      headers: buildHeaders(sessionid)
    });

    if (igRes.status === 401 || igRes.status === 403) {
      return res.status(401).json({ error: 'Session expired or invalid' });
    }

    if (!igRes.ok) {
      return res.status(502).json({ error: `Instagram returned HTTP ${igRes.status}` });
    }

    const data = await igRes.json();
    const user = data.user || {};

    return res.status(200).json({
      username:  user.username          || null,
      full_name: user.full_name         || null,
      avatar:    user.profile_pic_url   || null,
      user_id:   user.pk                || null,
      verified:  user.is_verified       || false,
      private:   user.is_private        || false
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function buildHeaders(sessionid, csrfToken = '') {
  return {
    'User-Agent':      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Cookie':          `sessionid=${sessionid}${csrfToken ? `;csrftoken=${csrfToken}` : ''}`,
    'X-IG-App-ID':     '936619743392459',
    'X-CSRFToken':     csrfToken,
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer':         'https://www.instagram.com/',
    'Origin':          'https://www.instagram.com',
    'Sec-Fetch-Site':  'same-origin',
    'Sec-Fetch-Mode':  'cors',
    'Sec-Fetch-Dest':  'empty'
  };
}

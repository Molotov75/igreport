// api/report.js
// Submits a single report to Instagram on behalf of one session.
// Called once per account per report run. Rate limiting is handled client-side via delay.

import { ProxyAgent, fetch as undiciFetch } from 'undici';

// Instagram's internal report reason map — these are the values their own app sends
const REASON_MAP = {
  spam:        { reason: 'spam',                frx_context: 'account' },
  scam:        { reason: 'fraud_or_scam',       frx_context: 'account' },
  impersonate: { reason: 'impersonation',       frx_context: 'account' },
  hate:        { reason: 'hate_speech',         frx_context: 'account' },
  violence:    { reason: 'violence_or_threats', frx_context: 'account' },
  harassment:  { reason: 'bullying',            frx_context: 'account' },
  adult:       { reason: 'nudity_or_sexual',    frx_context: 'account' },
  false_info:  { reason: 'false_information',   frx_context: 'account' },
  ip:          { reason: 'intellectual_property', frx_context: 'account' },
  sale:        { reason: 'illegal_sales',       frx_context: 'account' },
  self_harm:   { reason: 'self_harm',           frx_context: 'account' },
  other:       { reason: 'something_else',      frx_context: 'account' }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionid, target_id, target_user, report_type, proxy } = req.body || {};

  if (!sessionid || !target_id || !report_type) {
    return res.status(400).json({ error: 'sessionid, target_id, and report_type required' });
  }

  const reason = REASON_MAP[report_type];
  if (!reason) {
    return res.status(400).json({ error: `Unknown report type: ${report_type}` });
  }

  // Step 1: Fetch CSRF token from active session
  let csrfToken;
  try {
    csrfToken = await fetchCsrf(sessionid, proxy);
  } catch (err) {
    return res.status(502).json({ success: false, message: `CSRF fetch failed: ${err.message}` });
  }

  // Step 2: Submit the report
  try {
    const body = new URLSearchParams({
      source_name:  reason.frx_context,
      reason_id:    reason.reason,
      frx_context:  reason.frx_context
    });

    const igRes = await igFetch(
      `https://www.instagram.com/api/v1/users/${target_id}/flag/`,
      {
        method:  'POST',
        headers: buildHeaders(sessionid, csrfToken),
        body:    body.toString()
      },
      proxy
    );

    const data = await igRes.json().catch(() => ({}));

    if (igRes.status === 200 && (data.status === 'ok' || data.result)) {
      return res.status(200).json({ success: true, message: 'Report submitted' });
    }

    if (igRes.status === 400) {
      return res.status(200).json({ success: false, message: data.message || 'Bad request — session may be rate limited' });
    }

    if (igRes.status === 401 || igRes.status === 403) {
      return res.status(200).json({ success: false, message: 'Session expired or unauthorized' });
    }

    if (igRes.status === 429) {
      return res.status(200).json({ success: false, message: 'Rate limited — increase delay between reports' });
    }

    return res.status(200).json({ success: false, message: `Instagram returned HTTP ${igRes.status}` });

  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function fetchCsrf(sessionid, proxy) {
  const igRes = await igFetch('https://www.instagram.com/', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Cookie':     `sessionid=${sessionid}`,
      'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  }, proxy);

  const html  = await igRes.text();
  const match = html.match(/"csrf_token":"([^"]+)"/);
  if (!match) throw new Error('CSRF token not found in response');
  return match[1];
}

async function igFetch(url, options, proxy) {
  if (proxy) {
    const proxyUrl    = buildProxyUrl(proxy);
    const dispatcher  = new ProxyAgent({ uri: proxyUrl, timeout: 12000 });
    return undiciFetch(url, { ...options, dispatcher });
  }
  return fetch(url, options);
}

function buildHeaders(sessionid, csrfToken) {
  return {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Cookie':          `sessionid=${sessionid}; csrftoken=${csrfToken}`,
    'X-CSRFToken':     csrfToken,
    'Content-Type':    'application/x-www-form-urlencoded',
    'Referer':         'https://www.instagram.com/',
    'Origin':          'https://www.instagram.com',
    'X-IG-App-ID':     '936619743392459',
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Site':  'same-origin',
    'Sec-Fetch-Mode':  'cors',
    'Sec-Fetch-Dest':  'empty'
  };
}

function buildProxyUrl(p) {
  const proto = ['socks5', 'socks4'].includes(p.type) ? p.type : 'http';
  const auth  = p.user && p.pass ? `${encodeURIComponent(p.user)}:${encodeURIComponent(p.pass)}@` : '';
  return `${proto}://${auth}${p.host}:${p.port}`;
}

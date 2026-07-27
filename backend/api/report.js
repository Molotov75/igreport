const https = require('https');
const http  = require('http');

const REASON_MAP = {
  spam:        'spam',
  scam:        'fraud_or_scam',
  impersonate: 'impersonation',
  hate:        'hate_speech',
  violence:    'violence_or_threats',
  harassment:  'bullying',
  adult:       'nudity_or_sexual',
  false_info:  'false_information',
  ip:          'intellectual_property',
  sale:        'illegal_sales',
  self_harm:   'self_harm',
  other:       'something_else'
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { sessionid, target_id, report_type } = req.body || {};

  if (!sessionid)   return res.status(400).json({ error: 'sessionid required' });
  if (!target_id)   return res.status(400).json({ error: 'target_id required' });
  if (!report_type) return res.status(400).json({ error: 'report_type required' });

  const reason = REASON_MAP[report_type];
  if (!reason) return res.status(400).json({ error: `Unknown report type: ${report_type}` });

  // Step 1: get CSRF token
  let csrfToken;
  try {
    csrfToken = await fetchCsrf(sessionid);
  } catch (err) {
    return res.status(502).json({ success: false, message: `CSRF fetch failed: ${err.message}` });
  }

  // Step 2: submit report
  try {
    const body    = `source_name=account&reason_id=${encodeURIComponent(reason)}&frx_context=account`;
    const result  = await submitReport(target_id, sessionid, csrfToken, body);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

function fetchCsrf(sessionid) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.instagram.com',
      path:     '/',
      method:   'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie':     `sessionid=${sessionid}`,
        'Accept':     'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    };

    const req = https.request(options, (r) => {
      let html = '';
      r.on('data', chunk => html += chunk);
      r.on('end', () => {
        const match = html.match(/"csrf_token":"([^"]+)"/);
        if (!match) return reject(new Error('CSRF token not found'));
        resolve(match[1]);
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('CSRF request timed out')); });
    req.end();
  });
}

function submitReport(targetId, sessionid, csrfToken, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.instagram.com',
      path:     `/api/v1/users/${targetId}/flag/`,
      method:   'POST',
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie':          `sessionid=${sessionid}; csrftoken=${csrfToken}`,
        'X-CSRFToken':     csrfToken,
        'Content-Type':    'application/x-www-form-urlencoded',
        'Content-Length':  Buffer.byteLength(body),
        'Referer':         'https://www.instagram.com/',
        'Origin':          'https://www.instagram.com',
        'X-IG-App-ID':     '936619743392459',
        'Accept':          'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    };

    const req = https.request(options, (r) => {
      let data = '';
      r.on('data', chunk => data += chunk);
      r.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(data); } catch {}

        if (r.statusCode === 200 && (parsed.status === 'ok' || parsed.result)) {
          return resolve({ success: true, message: 'Report submitted' });
        }
        if (r.statusCode === 401 || r.statusCode === 403) {
          return resolve({ success: false, message: 'Session expired or unauthorized' });
        }
        if (r.statusCode === 429) {
          return resolve({ success: false, message: 'Rate limited — increase delay' });
        }

        resolve({ success: false, message: parsed.message || `Instagram returned HTTP ${r.statusCode}` });
      });
    });

    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('Report request timed out')); });
    req.write(body);
    req.end();
  });
}

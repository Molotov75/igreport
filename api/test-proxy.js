// api/test-proxy.js
// Tests whether a proxy is reachable by hitting a known endpoint through it.
// Uses the `undici` ProxyAgent — available in Node 18+ / Vercel runtime.

import { ProxyAgent, fetch as undiciFetch } from 'undici';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { proxy } = req.body || {};
  if (!proxy || !proxy.host || !proxy.port) {
    return res.status(400).json({ error: 'proxy.host and proxy.port required' });
  }

  const proxyUrl = buildProxyUrl(proxy);

  try {
    const dispatcher = new ProxyAgent({
      uri:     proxyUrl,
      timeout: 8000
    });

    const start  = Date.now();
    const testRes = await undiciFetch('https://www.instagram.com/', {
      dispatcher,
      signal: AbortSignal.timeout(8000)
    });

    const latency = Date.now() - start;

    return res.status(200).json({
      ok:      testRes.status < 500,
      latency,
      status:  testRes.status
    });

  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}

function buildProxyUrl(p) {
  const proto = ['socks5', 'socks4'].includes(p.type) ? p.type : 'http';
  const auth  = p.user && p.pass ? `${encodeURIComponent(p.user)}:${encodeURIComponent(p.pass)}@` : '';
  return `${proto}://${auth}${p.host}:${p.port}`;
}

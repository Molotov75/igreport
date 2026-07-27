const https = require('https');
const http  = require('http');
const net   = require('net');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { proxy } = req.body || {};
  if (!proxy || !proxy.host || !proxy.port) {
    return res.status(400).json({ error: 'proxy.host and proxy.port required' });
  }

  try {
    const start   = Date.now();
    const alive   = await testTcpConnect(proxy.host, parseInt(proxy.port), 7000);
    const latency = Date.now() - start;

    return res.status(200).json({ ok: alive, latency });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
};

function testTcpConnect(host, port, timeout) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled  = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.connect(port, host, () => done(true));
    socket.on('error',   () => done(false));
    socket.on('timeout', () => done(false));
  });
}

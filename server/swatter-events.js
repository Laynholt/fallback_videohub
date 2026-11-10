'use strict';

const { write } = require('node:fs');
const net = require('node:net');
const { performance } = require('node:perf_hooks');

const ENDPOINT = '/api/_events';
const MAX_BODY_BYTES = 256;
const MAX_QUEUED_EVENTS = 256;
const EVENT_NAMES = Object.freeze({ login_submit: 'decoy_login_attempt', register_submit: 'decoy_register_attempt' });
const PAGES = new Set(['catalog', 'video']);

function normalizeIp(value) {
  if (typeof value !== 'string' || value.includes('%') || !net.isIP(value)) return null;
  if (net.isIP(value) === 4) return value;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (!mapped) return canonical;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

// Conservatively exclude nonpublic addresses from client attribution.
const reserved = new net.BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) reserved.addSubnet(address, prefix, 'ipv4');
const globalV6 = new net.BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]]) {
  reserved.addSubnet(address, prefix, 'ipv6');
}

function publicPeer(ip) {
  const family = net.isIP(ip) === 4 ? 'ipv4' : 'ipv6';
  return !reserved.check(ip, family) && (family === 'ipv4' || globalV6.check(ip, family));
}

function createEmitter() {
  try {
    // Initializing Node stdio makes a piped descriptor nonblocking.
    void process.stdout;
  } catch { /* The descriptor write reports an unavailable sink. */ }
  // Lines wait in a bounded queue so a busy pipe delays events instead of dropping them.
  const queue = [];
  let writing = false;
  function flush() {
    if (!queue.length) { writing = false; return; }
    writing = true;
    try {
      write(1, queue[0], error => {
        if (error?.code === 'EAGAIN') { setTimeout(flush, 50).unref(); return; }
        queue.shift();
        flush();
      });
    } catch { queue.length = 0; writing = false; }
  }
  return event => {
    if (queue.length >= MAX_QUEUED_EVENTS) return;
    queue.push(JSON.stringify(event) + '\n');
    if (!writing) flush();
  };
}

// Only a private-network proxy may name the client; its own address stays in peer_ip.
// The rightmost X-Forwarded-For entry is the one the proxy wrote itself: nginx appends it
// and Caddy replaces untrusted values, while X-Real-IP passes through Caddy unchanged.
function proxiedClient(request, peer) {
  if (publicPeer(peer)) return null;
  const values = request.headersDistinct['x-forwarded-for'];
  return values ? normalizeIp(values.join(',').split(',').at(-1).trim()) : null;
}

function createTelemetryHandler(allowedOrigin, instance, { trustProxy = false } = {}) {
  const origin = new URL(allowedOrigin);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== allowedOrigin ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(instance)) throw new TypeError('Invalid Swatter configuration');
  const emit = createEmitter();
  const peers = new Map();
  let pending = 0;

  function admit(peer) {
    const now = performance.now();
    for (const [key, entry] of peers) if (now >= entry.expires) peers.delete(key);
    let entry = peers.get(peer);
    if (!entry) {
      // Keep active entries so rotating peers cannot reset an existing limit.
      if (peers.size >= 1024) return false;
      entry = { count: 0, expires: now + 60_000 };
      peers.set(peer, entry);
    }
    entry.count++;
    return entry.count <= 30;
  }

  return function handleTelemetry(request, response) {
    if (typeof request.url !== 'string' || request.url.split('?', 1)[0] !== ENDPOINT) return false;
    function reject(status) {
      response.writeHead(status, { 'Cache-Control': 'no-store', 'Content-Length': '0', Connection: 'close' });
      response.end();
      request.resume();
    }
    const peer = normalizeIp(request.socket.remoteAddress);
    const proxied = trustProxy && peer ? proxiedClient(request, peer) : null;
    const client = proxied || peer;
    if (!client) { reject(429); return true; }
    if (request.url !== ENDPOINT) { reject(400); return true; }
    if (request.method !== 'POST') { reject(405); return true; }
    const origins = request.headersDistinct.origin;
    if (origins?.length !== 1 || origins[0] !== origin.origin) { reject(403); return true; }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type'] || '') || request.headers['content-encoding']) {
      reject(415); return true;
    }
    const length = request.headers['content-length'];
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) { reject(413); return true; }
    if (pending >= 32) { reject(503); return true; }
    if (!admit(client)) { reject(429); return true; }
    pending++;
    let done = false;
    let size = 0;
    let chunks = [];
    const timer = setTimeout(() => finish(408), 2_000);
    timer.unref();
    function finish(status) {
      if (done) return;
      done = true;
      pending--;
      clearTimeout(timer);
      chunks = [];
      if (status === null || response.destroyed) return;
      if (status !== 204) reject(status);
      else {
        response.writeHead(204, { 'Cache-Control': 'no-store' });
        response.end();
      }
    }
    request.on('aborted', () => finish(null));
    request.on('error', () => finish(null));
    response.on('close', () => finish(null));
    request.on('data', chunk => {
      if (done) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { finish(413); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (done) return;
      let input;
      try {
        input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)));
      } catch { finish(400); return; }
      if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).length !== 2 ||
          !Object.hasOwn(input, 'event') || !Object.hasOwn(input, 'page') ||
          typeof input.event !== 'string' || !Object.hasOwn(EVENT_NAMES, input.event) || !PAGES.has(input.page)) {
        finish(400); return;
      }
      const attributable = publicPeer(client);
      emit({ schema: 'moskit.security.v1', ts: Date.now() / 1000, event: EVENT_NAMES[input.event],
        service: 'videohub', instance, peer_ip: peer, client_ip: attributable ? client : null,
        ip_source: attributable ? (proxied ? 'trusted_proxy' : 'transport_peer') : 'unattributed',
        page: input.page, signal: 'client_reported' });
      finish(204);
    });
    return true;
  };
}

module.exports = { ENDPOINT, createTelemetryHandler };

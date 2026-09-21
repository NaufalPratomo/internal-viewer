import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import os from 'os';

export const dynamic = 'force-dynamic';

// Validasi format target untuk mencegah command injection
function isValidTarget(target) {
  if (typeof target !== 'string') return false;
  const trimmed = target.trim();
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const hostRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return ipv4Regex.test(trimmed) || hostRegex.test(trimmed);
}

// Eksekusi ping cross-platform (Windows & Linux)
function pingHost(target, timeoutMs = 800) {
  return new Promise((resolve) => {
    const trimmed = target.trim();
    if (!isValidTarget(trimmed)) {
      return resolve({
        ip: trimmed,
        status: 'offline',
        latency: '-',
        hostname: '',
        error: 'Format IP atau hostname tidak valid'
      });
    }

    const isWin = os.platform() === 'win32';
    const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));

    // Argumen ping: Windows (-a -n 1 -w ms) vs Linux/macOS (-c 1 -W sec)
    const args = isWin
      ? ['-a', '-n', '1', '-w', String(timeoutMs), trimmed]
      : ['-c', '1', '-W', String(timeoutSec), trimmed];

    execFile('ping', args, { timeout: timeoutMs + 1000 }, (error, stdout, stderr) => {
      const output = (stdout || '') + (stderr || '');

      // Deteksi hostname jika ada: Pinging HOSTNAME [IP]
      let detectedHostname = '';
      const hostMatch = output.match(/Pinging\s+([a-zA-Z0-9._-]+)\s+\[/i);
      if (hostMatch && hostMatch[1] && hostMatch[1].toLowerCase() !== trimmed.toLowerCase()) {
        detectedHostname = hostMatch[1];
      }

      // Deteksi reply sukses Windows: Reply from 192.168.8.1: bytes=32 time=1ms TTL=64 OR time<1ms
      const winMatch = output.match(/Reply from [^:]+:\s+bytes=\d+\s+time([=<]\d+ms)\s+TTL=\d+/i);
      if (winMatch) {
        return resolve({
          ip: trimmed,
          status: 'online',
          latency: winMatch[1].replace('=', ''),
          hostname: detectedHostname,
          lastChecked: new Date().toISOString()
        });
      }

      // Deteksi reply sukses Linux/Unix: 64 bytes from ...: icmp_seq=1 ttl=... time=0.456 ms
      const linuxMatch = output.match(/bytes from [^:]+:\s+icmp_seq=\d+\s+ttl=\d+\s+time=([\d.]+)\s*ms/i);
      if (linuxMatch) {
        const ms = Math.round(parseFloat(linuxMatch[1]));
        return resolve({
          ip: trimmed,
          status: 'online',
          latency: `${ms}ms`,
          hostname: detectedHostname,
          lastChecked: new Date().toISOString()
        });
      }

      // Offline / Unreachable
      return resolve({
        ip: trimmed,
        status: 'offline',
        latency: '-',
        hostname: detectedHostname,
        lastChecked: new Date().toISOString()
      });
    });
  });
}

// Concurrency helper
async function mapConcurrent(items, limit, fn) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Batch ping
    if (body.ips && Array.isArray(body.ips)) {
      const targets = body.ips.slice(0, 60);
      const results = await mapConcurrent(targets, 10, target => pingHost(target, 800));
      return NextResponse.json(results);
    }

    // Single ping
    if (body.ip) {
      const result = await pingHost(body.ip, 900);
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: 'Parameter "ip" atau "ips" diperlukan' },
      { status: 400 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Terjadi kesalahan saat memproses ping' },
      { status: 500 }
    );
  }
}

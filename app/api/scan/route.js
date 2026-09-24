import { NextResponse } from 'next/server';
import { execFile } from 'child_process';
import os from 'os';

export const dynamic = 'force-dynamic';

function pingHostFast(target, timeoutMs = 500) {
  return new Promise((resolve) => {
    const isWin = os.platform() === 'win32';
    const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
    const args = isWin
      ? ['-a', '-n', '1', '-w', String(timeoutMs), target]
      : ['-c', '1', '-W', String(timeoutSec), target];

    try {
      execFile('ping', args, { timeout: timeoutMs + 1000 }, (error, stdout, stderr) => {
        try {
          const output = (stdout || '') + (stderr || '');

          let detectedHostname = '';
          const hostMatch = output.match(/Pinging\s+([a-zA-Z0-9._-]+)\s+\[/i);
          if (hostMatch && hostMatch[1] && hostMatch[1].toLowerCase() !== target.toLowerCase()) {
            detectedHostname = hostMatch[1];
          }

          const winMatch = output.match(/Reply from [^:]+:\s+bytes=\d+\s+time([=<]\d+ms)\s+TTL=\d+/i);
          if (winMatch) {
            return resolve({
              ip: target,
              status: 'online',
              latency: winMatch[1].replace('=', ''),
              hostname: detectedHostname,
              lastChecked: new Date().toISOString()
            });
          }

          const linuxMatch = output.match(/bytes from [^:]+:\s+icmp_seq=\d+\s+ttl=\d+\s+time=([\d.]+)\s*ms/i);
          if (linuxMatch) {
            const ms = Math.round(parseFloat(linuxMatch[1]));
            return resolve({
              ip: target,
              status: 'online',
              latency: `${ms}ms`,
              hostname: detectedHostname,
              lastChecked: new Date().toISOString()
            });
          }

          return resolve({
            ip: target,
            status: 'offline',
            latency: '-',
            hostname: detectedHostname,
            lastChecked: new Date().toISOString()
          });
        } catch (innerErr) {
          return resolve({
            ip: target,
            status: 'offline',
            latency: '-',
            hostname: '',
            lastChecked: new Date().toISOString()
          });
        }
      });
    } catch (e) {
      return resolve({
        ip: target,
        status: 'offline',
        latency: '-',
        hostname: '',
        lastChecked: new Date().toISOString()
      });
    }
  });
}

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
    const subnet = (body.subnet || '').trim();
    const start = parseInt(body.start, 10) || 1;
    const end = parseInt(body.end, 10) || 30;

    if (!/^(\d{1,3}\.){2}\d{1,3}$/.test(subnet)) {
      return NextResponse.json(
        { error: 'Format subnet tidak valid (contoh: 192.168.1)' },
        { status: 400 }
      );
    }

    const safeStart = Math.max(1, Math.min(start, 254));
    const safeEnd = Math.max(safeStart, Math.min(end, 254));

    const totalToScan = safeEnd - safeStart + 1;
    if (totalToScan > 254) {
      return NextResponse.json(
        { error: 'Rentang pindai maksimal 254 alamat IP per sesi' },
        { status: 400 }
      );
    }

    const ipList = [];
    for (let i = safeStart; i <= safeEnd; i++) {
      ipList.push(`${subnet}.${i}`);
    }

    // Concurrency ditingkatkan ke 25 proses paralel agar pemindaian hingga 254 IP selesai dalam hitungan detik
    const scanResults = await mapConcurrent(ipList, 25, ip => pingHostFast(ip, 400));

    return NextResponse.json({
      scanned: ipList.length,
      active: scanResults.filter(r => r.status === 'online'),
      results: scanResults
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Terjadi kesalahan saat memindai subnet' },
      { status: 500 }
    );
  }
}

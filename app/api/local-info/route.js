import { NextResponse } from 'next/server';
import os from 'os';
import { execFile } from 'child_process';

export const dynamic = 'force-dynamic';

function getStaticWindowsIp() {
  return new Promise((resolve) => {
    if (os.platform() !== 'win32') return resolve(null);

    execFile('reg', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces', '/s', '/v', 'IPAddress'], { timeout: 1500 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const match = stdout.match(/IPAddress\s+REG_MULTI_SZ\s+([0-9.]+)/i);
      if (match && match[1] && match[1] !== '0.0.0.0') {
        const ip = match[1].trim();
        const subnet = ip.split('.').slice(0, 3).join('.');
        return resolve({
          ip,
          subnet
        });
      }
      resolve(null);
    });
  });
}

export async function GET(request) {
  try {
    // Ambil IP client yang sedang mengakses via HTTP header (aktif saat dibuka via Vercel/cloud)
    const forwardedFor = request ? request.headers.get('x-forwarded-for') : null;
    const realIp = request ? request.headers.get('x-real-ip') : null;
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : (realIp || '');

    const isCloud = Boolean(process.env.VERCEL || process.env.AWS_REGION);

    const interfaces = os.networkInterfaces();
    const candidates = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const parts = iface.address.split('.');
          const subnet = parts.slice(0, 3).join('.');
          candidates.push({
            interface: name,
            ip: iface.address,
            netmask: iface.netmask,
            subnet: subnet,
            status: 'connected'
          });
        }
      }
    }

    // Ambil IP statis manual jika ada di registry (seperti IP Ethernet yang kabelnya belum tercolok)
    const staticConfig = await getStaticWindowsIp();
    let ethernetIp = '';
    let ethernetSubnet = '';

    if (staticConfig) {
      ethernetIp = staticConfig.ip;
      ethernetSubnet = staticConfig.subnet;
      // Jika IP ini belum ada di adapter aktif, tambahkan sebagai adapter tersimpan
      const alreadyInList = candidates.some(c => c.ip === staticConfig.ip);
      if (!alreadyInList) {
        candidates.push({
          interface: 'Ethernet',
          ip: staticConfig.ip,
          netmask: '255.255.255.0',
          subnet: staticConfig.subnet,
          status: 'disconnected'
        });
      }
    }

    // Cari interface aktif (prioritas Wi-Fi atau adapter yang saat ini tersambung)
    const activeWifi = candidates.find(c => c.interface.toLowerCase().includes('wi-fi') && c.status === 'connected');
    const primaryActive = activeWifi || candidates.find(c => c.status === 'connected') || candidates[0] || null;

    // Deteksi IP WAN publik (dengan timeout aman 2 detik)
    let wanIp = '';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const wanRes = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (wanRes.ok) {
        const wanData = await wanRes.json();
        wanIp = wanData.ip || '';
      }
    } catch {
      wanIp = '';
    }

    // Kumpulkan seluruh subnet yang bisa dipindai
    const subnets = Array.from(new Set(candidates.map(c => c.subnet).filter(Boolean)));

    return NextResponse.json({
      hostname: os.hostname(),
      localIp: primaryActive ? primaryActive.ip : '',
      activeInterface: primaryActive ? primaryActive.interface : (isCloud ? 'Cloud (Vercel)' : ''),
      subnet: primaryActive ? primaryActive.subnet : '',
      ethernetIp: ethernetIp,
      ethernetSubnet: ethernetSubnet,
      wanIp: wanIp || clientIp,
      clientIp: clientIp,
      isCloud: isCloud,
      subnets: subnets,
      allInterfaces: candidates
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'Gagal mengambil informasi interface lokal' },
      { status: 500 }
    );
  }
}

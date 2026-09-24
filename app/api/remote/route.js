import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

export const dynamic = 'force-dynamic';

const RDP_DIR = path.join(process.cwd(), 'rdp-configs');

export async function POST(request) {
  try {
    const body = await request.json();
    const { ip, name, username, password } = body;

    if (!ip) {
      return NextResponse.json({ error: 'Alamat IP wajib diisi' }, { status: 400 });
    }

    // Pastikan folder rdp-configs di dalam project tersedia
    if (!fs.existsSync(RDP_DIR)) {
      fs.mkdirSync(RDP_DIR, { recursive: true });
    }

    // Buat nama file yang aman di dalam folder project
    const safeName = (name || ip)
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '_');
    const filename = `${safeName}.rdp`;
    const rdpFilePath = path.join(RDP_DIR, filename);

    // Susun isi standar konfigurasi .rdp
    const rdpLines = [
      `full address:s:${ip}:3389`,
      'prompt for credentials:i:0',
      'screen mode id:i:2',
      'use multimon:i:0',
      'desktopwidth:i:1920',
      'desktopheight:i:1080',
      'session bpp:i:32',
      'compression:i:1',
      'keyboardhook:i:2',
      'audiomode:i:0',
      'redirectprinters:i:0',
      'redirectcomports:i:0',
      'redirectsmartcards:i:0',
      'redirectclipboard:i:1',
      'redirectposdevices:i:0',
      'displayconnectionbar:i:1',
      'autoreconnection enabled:i:1',
      'authentication level:i:2',
      'negotiate security layer:i:1'
    ];

    if (username && username.trim()) {
      rdpLines.push(`username:s:${username.trim()}`);
    }

    const rdpContent = rdpLines.join('\r\n') + '\r\n';
    fs.writeFileSync(rdpFilePath, rdpContent, 'utf8');

    // Jika sistem berjalan di OS Windows (PC host), daftarkan kredensial & buka mstsc langsung
    if (process.platform === 'win32') {
      if (username && password) {
        // Daftarkan kredensial ke Windows Credential Manager agar langsung login otomatis
        const cmdKeyCommand = `cmdkey /generic:TERMSRV/${ip} /user:"${username.trim()}" /pass:"${password}"`;
        exec(cmdKeyCommand, (err) => {
          if (err) console.warn('Peringatan saat mendaftarkan cmdkey:', err.message);
        });
      }

      // Jalankan aplikasi Remote Desktop bawaan Windows dengan file konfigurasi dari folder project
      exec(`start "" mstsc.exe "${rdpFilePath}"`, (err) => {
        if (err) console.warn('Peringatan saat menjalankan mstsc:', err.message);
      });

      return NextResponse.json({
        success: true,
        launchedLocally: true,
        savedPath: rdpFilePath,
        filename
      });
    }

    // Jika bukan Windows atau diakses jarak jauh, kembalikan info file tersimpan
    return NextResponse.json({
      success: true,
      launchedLocally: false,
      savedPath: rdpFilePath,
      filename,
      content: rdpContent
    });
  } catch (err) {
    console.error('Remote error:', err);
    return NextResponse.json({ error: err.message || 'Gagal menyiapkan remote desktop' }, { status: 500 });
  }
}

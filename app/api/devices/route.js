import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// APP_ROOT di-set oleh server.js sebelum Next.js start.
const PROJECT_ROOT = process.env.APP_ROOT || process.cwd();
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');

// ─── In-memory cache ───────────────────────────────────────────────────────
// Primary storage selama proses PM2 berjalan.
// Dibaca dari file sekali saat modul pertama kali dimuat.
// File hanya dipakai sebagai backup untuk restore saat PM2 restart.
let _cache = null;

function getCache() {
  if (_cache !== null) return _cache;

  // Inisialisasi dari file saat pertama kali dipanggil
  try {
    if (fs.existsSync(DEVICES_FILE)) {
      const raw = fs.readFileSync(DEVICES_FILE, 'utf8');
      const parsed = JSON.parse(raw || '[]');
      _cache = Array.isArray(parsed) ? parsed : [];
      console.log('[devices] Cache init dari file:', _cache.length, 'device —', DEVICES_FILE);
    } else {
      _cache = [];
      console.log('[devices] File belum ada, cache kosong —', DEVICES_FILE);
    }
  } catch (err) {
    console.error('[devices] Gagal baca file saat init:', err.message);
    _cache = [];
  }

  return _cache;
}

function persistToFile(devices) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[devices] GAGAL tulis file:', err.message);
    return false;
  }
}
// ──────────────────────────────────────────────────────────────────────────

export async function GET() {
  const devices = getCache();
  return NextResponse.json(devices, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Body harus berupa array' }, { status: 400 });
    }

    // Tulis ke memory dulu (langsung, tidak bisa gagal)
    _cache = body;

    // Tulis ke file sebagai backup (boleh gagal, data tetap ada di memory)
    const saved = persistToFile(body);

    console.log('[devices POST] Cache diperbarui:', body.length, 'device | file:', saved ? 'OK' : 'GAGAL');

    return NextResponse.json({ success: true, count: body.length, fileSaved: saved });
  } catch (err) {
    console.error('[devices POST] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


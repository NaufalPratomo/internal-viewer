import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const dynamic = 'force-dynamic';

// Gunakan __dirname berbasis import.meta.url agar path SELALU relatif ke project root,
// bukan tergantung process.cwd() yang bisa berubah tergantung cara PM2 dijalankan.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Naik 3 tingkat: app/api/devices/ -> app/api/ -> app/ -> root project
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');

// Log path sekali saat module dimuat, untuk debugging di PM2
console.log('[devices route] PROJECT_ROOT:', PROJECT_ROOT);
console.log('[devices route] DEVICES_FILE:', DEVICES_FILE);
console.log('[devices route] process.cwd():', process.cwd());

const DEFAULT_DEVICES = [];

function readDevices() {
  try {
    if (!fs.existsSync(DEVICES_FILE)) {
      console.warn('[devices GET] File tidak ditemukan:', DEVICES_FILE);
      return DEFAULT_DEVICES;
    }
    const content = fs.readFileSync(DEVICES_FILE, 'utf8');
    const parsed = JSON.parse(content || '[]');
    console.log('[devices GET] Berhasil baca', parsed.length, 'device dari', DEVICES_FILE);
    return Array.isArray(parsed) ? parsed : DEFAULT_DEVICES;
  } catch (err) {
    console.error('[devices GET] Gagal membaca file:', err.message);
    return DEFAULT_DEVICES;
  }
}

function saveDevices(devices) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2), 'utf8');
    console.log('[devices POST] Berhasil simpan', devices.length, 'device ke', DEVICES_FILE);
    return true;
  } catch (err) {
    console.error('[devices POST] GAGAL simpan file:', err.message);
    return false;
  }
}

export async function GET() {
  const devices = readDevices();
  return NextResponse.json(devices, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Body harus berupa array perangkat' }, { status: 400 });
    }
    console.log('[devices POST] Menerima', body.length, 'device untuk disimpan');
    const saved = saveDevices(body);
    // Kirim path file kembali ke client untuk debugging
    return NextResponse.json({
      success: true,
      count: body.length,
      persistedLocally: saved,
      filePath: DEVICES_FILE
    });
  } catch (err) {
    console.error('[devices POST] Error:', err.message);
    return NextResponse.json({ error: err.message || 'Gagal menyimpan perangkat' }, { status: 500 });
  }
}

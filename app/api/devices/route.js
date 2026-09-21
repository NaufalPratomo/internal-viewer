import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), 'data');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');

// Default initial devices (kosong murni, tanpa data dummy)
const DEFAULT_DEVICES = [];

function readDevices() {
  try {
    if (!fs.existsSync(DEVICES_FILE)) {
      return DEFAULT_DEVICES;
    }
    const content = fs.readFileSync(DEVICES_FILE, 'utf8');
    const parsed = JSON.parse(content || '[]');
    return Array.isArray(parsed) ? parsed : DEFAULT_DEVICES;
  } catch (err) {
    console.error('Gagal membaca file devices:', err);
    return DEFAULT_DEVICES;
  }
}

function saveDevices(devices) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DEVICES_FILE, JSON.stringify(devices, null, 2), 'utf8');
    return true;
  } catch (err) {
    // In serverless / read-only environments, write may fail
    console.warn('Gagal menyimpan file devices (kemungkinan lingkungan read-only/serverless):', err.message);
    return false;
  }
}

export async function GET() {
  const devices = readDevices();
  return NextResponse.json(devices);
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: 'Body harus berupa array perangkat' }, { status: 400 });
    }
    const saved = saveDevices(body);
    return NextResponse.json({ success: true, count: body.length, persistedLocally: saved });
  } catch (err) {
    return NextResponse.json({ error: err.message || 'Gagal menyimpan perangkat' }, { status: 500 });
  }
}

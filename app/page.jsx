'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// Deteksi otomatis apakah IP / Hostname merupakan LAN atau WAN
function detectNetworkType(str) {
  if (!str) return 'LAN';
  const trimmed = str.trim().toLowerCase();
  if (trimmed === 'localhost' || trimmed === '127.0.0.1') return 'LAN';

  // RFC 1918 Private IPv4 ranges
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed)) return 'LAN';
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(trimmed)) return 'LAN';
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(trimmed)) return 'LAN';

  // Single-word local hostnames (e.g. pc-kasir, desktop-admin)
  if (/^[a-z0-9_-]+$/.test(trimmed)) return 'LAN';

  // Public IP atau domain internet
  return 'WAN';
}

export default function HomePage() {
  // State Utama
  const [devices, setDevices] = useState([]);
  const [localInfo, setLocalInfo] = useState({
    hostname: '',
    localIp: 'Mendeteksi...',
    subnet: '192.168.1',
    wanIp: ''
  });
  const [theme, setTheme] = useState('light');
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(30);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [lastUpdatedText, setLastUpdatedText] = useState('Status siap diperiksa');

  // Filter Kategori Jaringan (All, LAN, WAN)
  const [activeFilter, setActiveFilter] = useState('all');

  // State Form Tambah Perangkat
  const [inputIp, setInputIp] = useState('');
  const [inputName, setInputName] = useState('');
  const [inputType, setInputType] = useState('auto'); // 'auto' | 'LAN' | 'WAN'
  const [formError, setFormError] = useState('');

  // State Modal Subnet Scan
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scanSubnet, setScanSubnet] = useState('192.168.1');
  const [scanStart, setScanStart] = useState(1);
  const [scanEnd, setScanEnd] = useState(30);
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatusMsg, setScanStatusMsg] = useState('');
  const [scanActiveFound, setScanActiveFound] = useState([]);
  const [selectedScanIps, setSelectedScanIps] = useState({});

  // State Modal Edit
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editTypeValue, setEditTypeValue] = useState('LAN');
  const [editUsernameValue, setEditUsernameValue] = useState('');
  const [editPasswordValue, setEditPasswordValue] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // State Modal Peringatan Kredensial Remote RDP
  const [remoteWarnDevice, setRemoteWarnDevice] = useState(null);

  // Helper untuk membuka remote: validasi username terlebih dahulu
  const handleRemoteDevice = async (device) => {
    if (!device || !device.ip) return;

    // Jika username Windows belum diisi, tampilkan modal peringatan konfirmasi
    if (!device.username || !device.username.trim()) {
      setRemoteWarnDevice(device);
      return;
    }

    await executeRemoteCall(device);
  };

  // Eksekusi pemanggilan API remote RDP
  const executeRemoteCall = async (device) => {
    try {
      const res = await fetch('/api/remote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: device.ip,
          name: device.name,
          username: device.username,
          password: device.password
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.launchedLocally) {
          return;
        }

        if (data.content) {
          const blob = new Blob([data.content], { type: 'application/x-rdp;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = data.filename || `${device.ip}.rdp`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      console.error('Gagal menjalankan remote:', err);
    }
  };

  // Timer Ref
  const timerRef = useRef(null);

  // Inisialisasi Tema
  useEffect(() => {
    const saved = localStorage.getItem('lan_monitor_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = saved === 'dark' || (!saved && prefersDark) ? 'dark' : 'light';
    setTheme(initialTheme);
    if (initialTheme === 'dark') {
      document.body.classList.add('theme-dark');
    } else {
      document.body.classList.remove('theme-dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('lan_monitor_theme', nextTheme);
    if (nextTheme === 'dark') {
      document.body.classList.add('theme-dark');
    } else {
      document.body.classList.remove('theme-dark');
    }
  };

  // Format Waktu Ramah Manusia
  const formatTime = (isoString) => {
    if (!isoString) return 'Belum diperiksa';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return 'Belum diperiksa';
    }
  };

  // Kunci penyimpanan di browser
  const STORAGE_KEY = 'lan_monitor_devices';

  // Muat Data Awal
  const loadInitialData = async () => {
    try {
      const resInfo = await fetch('/api/local-info');
      if (resInfo.ok) {
        const info = await resInfo.json();
        setLocalInfo(info);
        if (info.subnet) {
          setScanSubnet(info.subnet);
        }
      }
    } catch (err) {
      console.warn('Gagal memuat local-info:', err);
    }

    try {
      // Ambil data langsung dari browser localStorage
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const normalized = (Array.isArray(parsed) ? parsed : []).map(d => ({
          ...d,
          networkType: d.networkType || detectNetworkType(d.ip)
        }));
        setDevices(normalized);
      } else {
        // Fallback default jika browser baru pertama kali dibuka
        const initialDefault = [
          {
            id: 'dev-localhost',
            ip: '127.0.0.1',
            name: 'Komputer Ini (Localhost)',
            status: 'online',
            latency: '<1ms',
            hostname: 'localhost',
            lastChecked: new Date().toISOString(),
            networkType: 'LAN'
          }
        ];
        setDevices(initialDefault);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initialDefault));
      }
    } catch (err) {
      console.warn('Gagal memuat devices dari localStorage:', err);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Simpan Daftar Perangkat ke browser localStorage
  const persistDevices = (newDevices) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newDevices));
    } catch (err) {
      console.error('Gagal menyimpan perangkat ke localStorage:', err);
    }
  };

  // Hitung Metrik Ringkasan Riil
  const totalCount = devices.length;
  const lanCount = devices.filter(d => (d.networkType || detectNetworkType(d.ip)) === 'LAN').length;
  const wanCount = devices.filter(d => (d.networkType || detectNetworkType(d.ip)) === 'WAN').length;

  const onlineDevices = devices.filter(d => d.status === 'online');
  const onlineCount = onlineDevices.length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;

  let averageLatency = '-';
  let totalLatencyMs = 0;
  let validLatencyCount = 0;

  onlineDevices.forEach(d => {
    if (d.latency) {
      const match = d.latency.match(/(\d+)/);
      if (match) {
        totalLatencyMs += parseInt(match[1], 10);
        validLatencyCount++;
      }
    }
  });

  if (validLatencyCount > 0) {
    averageLatency = `${Math.round(totalLatencyMs / validLatencyCount)} ms`;
  }

  // Filter daftar komputer berdasarkan tab aktif
  const filteredDevices = devices.filter(d => {
    if (activeFilter === 'lan') return (d.networkType || detectNetworkType(d.ip)) === 'LAN';
    if (activeFilter === 'wan') return (d.networkType || detectNetworkType(d.ip)) === 'WAN';
    return true;
  });

  // Ping Tunggal
  const pingSingleDevice = async (id) => {
    setDevices(prev => prev.map(d => d.id === id ? { ...d, status: 'checking' } : d));

    const targetDev = devices.find(d => d.id === id);
    if (!targetDev) return;

    try {
      const res = await fetch('/api/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: targetDev.ip })
      });

      if (res.ok) {
        const result = await res.json();
        setDevices(prev => {
          const updated = prev.map(d => {
            if (d.id === id) {
              return {
                ...d,
                status: result.status,
                latency: result.latency,
                hostname: result.hostname || d.hostname,
                lastChecked: result.lastChecked
              };
            }
            return d;
          });
          persistDevices(updated);
          return updated;
        });
      }
    } catch (err) {
      console.error('Ping single error:', err);
    }
  };

  // Ping Semua Komputer Sekaligus
  const pingAllDevices = useCallback(async () => {
    if (devices.length === 0 || isCheckingAll) return;

    setIsCheckingAll(true);
    setDevices(prev => prev.map(d => ({ ...d, status: 'checking' })));

    const ips = devices.map(d => d.ip);

    try {
      const res = await fetch('/api/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ips })
      });

      if (res.ok) {
        const results = await res.json();
        setDevices(prev => {
          const updated = prev.map(d => {
            const found = results.find(r => r.ip === d.ip);
            if (found) {
              return {
                ...d,
                status: found.status,
                latency: found.latency,
                hostname: found.hostname || d.hostname,
                lastChecked: found.lastChecked
              };
            }
            return d;
          });
          persistDevices(updated);
          return updated;
        });
        setLastUpdatedText(`Pemeriksaan selesai pada ${formatTime(new Date().toISOString())}`);
      }
    } catch (err) {
      console.error('Gagal memeriksa semua komputer:', err);
    } finally {
      setIsCheckingAll(false);
    }
  }, [devices, isCheckingAll]);

  // Handle Pengaturan Auto Refresh
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (autoRefreshInterval > 0 && devices.length > 0) {
      timerRef.current = setInterval(() => {
        pingAllDevices();
      }, autoRefreshInterval * 1000);
      setLastUpdatedText(`Pembaruan otomatis aktif: setiap ${autoRefreshInterval} detik`);
    } else if (autoRefreshInterval === 0) {
      setLastUpdatedText('Pembaruan otomatis dinonaktifkan');
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefreshInterval, devices.length, pingAllDevices]);

  // Tambah Komputer Baru
  const handleAddDevice = async (e) => {
    e.preventDefault();
    setFormError('');

    const target = inputIp.trim();
    const label = inputName.trim();

    if (!target) {
      setFormError('Alamat IP atau hostname wajib diisi.');
      return;
    }

    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const hostRegex = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    if (!ipv4Regex.test(target) && !hostRegex.test(target)) {
      setFormError('Format alamat IP atau hostname tidak valid.');
      return;
    }

    if (devices.some(d => d.ip.toLowerCase() === target.toLowerCase())) {
      setFormError(`Alamat ${target} sudah ada di daftar pemantauan.`);
      return;
    }

    // Tentukan tipe jaringan: pilihan manual pengguna atau deteksi otomatis
    const finalType = inputType === 'auto' ? detectNetworkType(target) : inputType;

    const newDevice = {
      id: 'dev-' + Date.now(),
      ip: target,
      name: label || target,
      networkType: finalType,
      status: 'checking',
      latency: '-',
      hostname: '',
      lastChecked: null
    };

    const updated = [newDevice, ...devices];
    setDevices(updated);
    setInputIp('');
    setInputName('');
    await persistDevices(updated);

    // Langsung ping perangkat baru
    pingSingleDevice(newDevice.id);
  };

  // Hapus Komputer
  const handleDeleteDevice = async (id) => {
    const target = devices.find(d => d.id === id);
    if (!target) return;
    const ok = window.confirm(`Hapus ${target.name || target.ip} dari daftar pemantauan?`);
    if (!ok) return;

    const updated = devices.filter(d => d.id !== id);
    setDevices(updated);
    await persistDevices(updated);
  };

  // Edit Komputer
  const openEditModal = (dev) => {
    setEditingDevice(dev);
    setEditNameValue(dev.name || '');
    setEditTypeValue(dev.networkType || detectNetworkType(dev.ip));
    setEditUsernameValue(dev.username || '');
    setEditPasswordValue(dev.password || '');
    setShowPassword(false);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingDevice) return;
    const updated = devices.map(d => {
      if (d.id === editingDevice.id) {
        return {
          ...d,
          name: editNameValue.trim() || d.ip,
          networkType: editTypeValue,
          username: editUsernameValue.trim(),
          password: editPasswordValue
        };
      }
      return d;
    });
    setDevices(updated);
    persistDevices(updated);
    setIsEditModalOpen(false);
    setEditingDevice(null);
  };

  // Subnet Scanner (Khusus LAN)
  const handleStartScan = async (e) => {
    e.preventDefault();
    if (!scanSubnet) return;

    setIsScanning(true);
    setScanStatusMsg(`Memindai rentang IP LAN ${scanSubnet}.${scanStart} hingga ${scanSubnet}.${scanEnd}...`);
    setScanActiveFound([]);
    setSelectedScanIps({});

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subnet: scanSubnet,
          start: scanStart,
          end: scanEnd
        })
      });

      if (res.ok) {
        const data = await res.json();
        const active = data.active || [];
        setScanActiveFound(active);

        const initialSelected = {};
        active.forEach(item => {
          const already = devices.some(d => d.ip === item.ip);
          if (!already) {
            initialSelected[item.ip] = true;
          }
        });
        setSelectedScanIps(initialSelected);

        if (active.length === 0) {
          setScanStatusMsg('Pemindaian selesai: Tidak ditemukan komputer online pada rentang ini.');
        } else {
          setScanStatusMsg(`Pemindaian selesai: Ditemukan ${active.length} komputer online.`);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setScanStatusMsg(errData.error || 'Gagal melakukan pemindaian subnet.');
      }
    } catch (err) {
      console.error('Scan error:', err);
      setScanStatusMsg('Terjadi kesalahan jaringan saat memindai.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddSelectedScanned = async () => {
    const toAdd = scanActiveFound.filter(item => selectedScanIps[item.ip]);
    if (toAdd.length === 0) {
      setIsScanModalOpen(false);
      return;
    }

    const newItems = toAdd.map(item => ({
      id: 'dev-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      ip: item.ip,
      name: item.hostname ? `PC ${item.hostname}` : `Komputer ${item.ip}`,
      networkType: 'LAN',
      status: 'online',
      latency: item.latency || '1ms',
      hostname: item.hostname || '',
      lastChecked: new Date().toISOString()
    }));

    const updated = [...newItems, ...devices];
    setDevices(updated);
    await persistDevices(updated);
    setIsScanModalOpen(false);
  };

  // Keyboard Escape Handler untuk Modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isScanModalOpen) setIsScanModalOpen(false);
        if (isEditModalOpen) setIsEditModalOpen(false);
        if (remoteWarnDevice) setRemoteWarnDevice(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isScanModalOpen, isEditModalOpen, remoteWarnDevice]);

  return (
    <div className="app-container">
      {/* Header Utama */}
      <header className="app-header">
        <div className="header-left">
          <div className="brand-badge">
            <svg className="icon-brand" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
              <line x1="6" y1="6" x2="6.01" y2="6"></line>
              <line x1="6" y1="18" x2="6.01" y2="18"></line>
            </svg>
            <span className="brand-title">LAN & WAN Monitor</span>
          </div>
          <h1 className="header-heading">Pemantau Komputer Jaringan (LAN & WAN)</h1>
        </div>

        <div className="header-right">
          <div className="host-badges-wrap">
            {localInfo.localIp ? (
              <div className="host-info" title={`Alamat IP ${localInfo.activeInterface || 'Lokal'} (Tersambung Aktif)`}>
                <span className="status-indicator-dot" aria-hidden="true"></span>
                <span>{localInfo.activeInterface || 'Lokal'}: {localInfo.localIp}</span>
              </div>
            ) : localInfo.isCloud ? (
              <div className="host-info" title="Aplikasi berjalan di Cloud Serverless (Vercel)">
                <span className="status-indicator-dot" aria-hidden="true"></span>
                <span>Mode: Cloud (Vercel)</span>
              </div>
            ) : null}
            {localInfo.ethernetIp && (
              <div className="host-info" title="Alamat IP Ethernet Statis (Kabel Terputus)">
                <span style={{ fontSize: '0.75rem', opacity: 0.75, color: 'var(--text-muted)' }}>Ethernet:</span>
                <span className="font-mono">{localInfo.ethernetIp}</span>
              </div>
            )}
            {localInfo.wanIp && (
              <div className="host-info" title="Alamat IP WAN Publik Internet">
                <span className="badge-net-type badge-net-wan">WAN</span>
                <span>{localInfo.wanIp}</span>
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn-theme-toggle"
            onClick={toggleTheme}
            aria-label="Ganti tema tampilan"
          >
            {theme === 'dark' ? (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
                <span>Mode Terang</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
                <span>Mode Gelap</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Ringkasan Metrik Riil */}
      <section className="summary-section" aria-label="Ringkasan Status Komputer">
        <div className="summary-card">
          <span className="summary-label">Total Komputer</span>
          <span className="summary-value">{totalCount}</span>
        </div>
        <div className="summary-card stat-online">
          <span className="summary-label">Komputer Online</span>
          <div className="summary-value-row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span className="summary-value">{onlineCount}</span>
          </div>
        </div>
        <div className="summary-card stat-offline">
          <span className="summary-label">Komputer Offline</span>
          <div className="summary-value-row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            <span className="summary-value">{offlineCount}</span>
          </div>
        </div>
        <div className="summary-card">
          <span className="summary-label">Rata-rata Respon</span>
          <span className="summary-value font-mono">{averageLatency}</span>
        </div>
      </section>

      {/* Form Tambah Komputer */}
      <section className="form-section">
        <h2 className="section-title">Tambah Alamat IP / Host Komputer</h2>
        <form onSubmit={handleAddDevice} className="device-form" noValidate>
          <div className="form-group">
            <label htmlFor="inputTargetIp" className="form-label">
              Alamat IP / Hostname <span className="required-mark">*</span>
            </label>
            <input
              type="text"
              id="inputTargetIp"
              className="form-input font-mono"
              placeholder="192.168.8.10 atau 8.8.8.8"
              value={inputIp}
              onChange={(e) => setInputIp(e.target.value)}
              required
              autoComplete="off"
            />
            <span className="form-hint">Dapat berupa IP LAN lokal atau IP WAN publik.</span>
          </div>

          <div className="form-group">
            <label htmlFor="inputTargetName" className="form-label">Label Nama Komputer</label>
            <input
              type="text"
              id="inputTargetName"
              className="form-input"
              placeholder="Contoh: PC Kasir, DNS Cloud (opsional)"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              autoComplete="off"
            />
            <span className="form-hint">Nama untuk mempermudah identifikasi.</span>
          </div>

          <div className="form-group">
            <label htmlFor="selectNetworkType" className="form-label">Kategori Jaringan</label>
            <select
              id="selectNetworkType"
              className="form-select"
              value={inputType}
              onChange={(e) => setInputType(e.target.value)}
            >
              <option value="auto">Deteksi Otomatis</option>
              <option value="LAN">LAN (Lokal)</option>
              <option value="WAN">WAN (Publik)</option>
            </select>
            <span className="form-hint">Pilih apakah IP lokal atau internet publik.</span>
          </div>

          <div className="form-action">
            <button type="submit" className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Tambah ke Daftar</span>
            </button>
          </div>
        </form>
        {formError && (
          <div className="alert-box alert-error" role="alert">
            {formError}
          </div>
        )}
      </section>

      {/* Bilah Kontrol & Aksi */}
      <section className="control-bar-section">
        <div className="control-left">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={pingAllDevices}
            disabled={isCheckingAll || devices.length === 0}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>{isCheckingAll ? 'Memeriksa...' : 'Periksa Semua Komputer'}</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setIsScanModalOpen(true)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <span>Pindai Rentang IP (Subnet LAN)</span>
          </button>
        </div>

        <div className="control-right">
          <div className="auto-refresh-box">
            <label htmlFor="selectInterval" className="refresh-label">Pembaruan Otomatis:</label>
            <select
              id="selectInterval"
              className="form-select"
              value={autoRefreshInterval}
              onChange={(e) => setAutoRefreshInterval(parseInt(e.target.value, 10))}
              aria-label="Pilih interval pembaruan otomatis"
            >
              <option value={0}>Nonaktif</option>
              <option value={10}>Setiap 10 Detik</option>
              <option value={30}>Setiap 30 Detik</option>
              <option value={60}>Setiap 60 Detik</option>
            </select>
          </div>
        </div>
      </section>

      {/* Tab Filter Kategori Jaringan */}
      {devices.length > 0 && (
        <div className="filter-tabs-bar" role="tablist" aria-label="Filter berdasarkan tipe jaringan">
          <span className="filter-tab-label">Filter Jaringan:</span>
          <button
            type="button"
            className={`btn-filter-tab ${activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => setActiveFilter('all')}
            role="tab"
            aria-selected={activeFilter === 'all'}
          >
            Semua <span className="filter-badge-count">{totalCount}</span>
          </button>
          <button
            type="button"
            className={`btn-filter-tab ${activeFilter === 'lan' ? 'active' : ''}`}
            onClick={() => setActiveFilter('lan')}
            role="tab"
            aria-selected={activeFilter === 'lan'}
          >
            Lokal <span className="filter-badge-count">{lanCount}</span>
          </button>
          <button
            type="button"
            className={`btn-filter-tab ${activeFilter === 'wan' ? 'active' : ''}`}
            onClick={() => setActiveFilter('wan')}
            role="tab"
            aria-selected={activeFilter === 'wan'}
          >
            WAN (Publik) <span className="filter-badge-count">{wanCount}</span>
          </button>
        </div>
      )}

      {/* Sub Status Bar */}
      <div className="status-sub-bar">
        <span>{lastUpdatedText}</span>
        {isCheckingAll && (
          <span className="checking-indicator">
            <span className="mini-spinner" aria-hidden="true"></span>
            <span>Sedang memeriksa ping...</span>
          </span>
        )}
      </div>

      {/* Tabel Komputer */}
      <main className="table-section">
        {filteredDevices.length === 0 ? (
          <div className="empty-state-box">
            <div className="empty-icon-wrap">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                <line x1="6" y1="6" x2="6.01" y2="6"></line>
                <line x1="6" y1="18" x2="6.01" y2="18"></line>
              </svg>
            </div>
            <h3 className="empty-title">
              {devices.length === 0
                ? 'Belum Ada Komputer yang Dipantau'
                : `Tidak ada perangkat pada kategori ${activeFilter === 'lan' ? 'Lokal' : 'WAN'}`}
            </h3>
            <p className="empty-desc">
              {devices.length === 0
                ? 'Masukkan alamat IP komputer pada form di atas, atau jalankan fitur Pindai Subnet untuk mendeteksi komputer lokal secara otomatis.'
                : 'Pilih tab Semua untuk melihat seluruh perangkat, atau tambahkan perangkat baru pada kategori ini.'}
            </p>
            {devices.length === 0 && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsScanModalOpen(true)}
              >
                Mulai Pindai Subnet
              </button>
            )}
          </div>
        ) : (
          <div className="table-responsive">
            <table className="device-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: '24%' }}>Nama Komputer</th>
                  <th scope="col" style={{ width: '22%' }}>Alamat IP / Host</th>
                  <th scope="col" style={{ width: '15%' }}>Status</th>
                  <th scope="col" style={{ width: '14%' }}>Waktu Respon</th>
                  <th scope="col" style={{ width: '25%' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((device) => {
                  const netType = device.networkType || detectNetworkType(device.ip);
                  return (
                    <tr key={device.id}>
                      <td>
                        <div className="device-name-wrap">
                          <span className="device-title">{device.name || 'Tanpa Label'}</span>
                          {device.hostname && (
                            <span className="device-hostname-sub">Host: {device.hostname}</span>
                          )}
                          {device.username && (
                            <span className="device-hostname-sub">User RDP: {device.username}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="ip-cell-wrap">
                          <span className="font-mono ip-text">{device.ip}</span>
                          <span className={`badge-net-type ${netType === 'WAN' ? 'badge-net-wan' : 'badge-net-lan'}`}>
                            {netType === 'WAN' ? 'WAN' : 'Lokal'}
                          </span>
                        </div>
                      </td>
                      <td>
                        {device.status === 'checking' && (
                          <span className="status-badge badge-checking">
                            <span className="mini-spinner" aria-hidden="true"></span>
                            <span>Memeriksa</span>
                          </span>
                        )}
                        {device.status === 'online' && (
                          <span className="status-badge badge-online">
                            <span className="badge-dot" aria-hidden="true"></span>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            <span>Online</span>
                          </span>
                        )}
                        {device.status === 'offline' && (
                          <span className="status-badge badge-offline">
                            <span className="badge-dot" aria-hidden="true"></span>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <line x1="18" y1="6" x2="6" y2="18"></line>
                              <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                            <span>Offline</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="device-name-wrap">
                          <span className="latency-value font-mono">
                            {device.status === 'online' ? (device.latency || '-') : '-'}
                          </span>
                          <span className="device-hostname-sub">
                            {formatTime(device.lastChecked)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="table-actions">
                          {netType === 'LAN' && (
                            <button
                              type="button"
                              className="btn btn-rdp btn-sm"
                              onClick={() => handleRemoteDevice(device)}
                              aria-label={`Buka Remote Desktop Windows untuk ${device.name || device.ip}`}
                              title={device.username ? `Remote RDP (User: ${device.username})` : 'Buka Remote Desktop Windows'}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                <line x1="8" y1="21" x2="16" y2="21"></line>
                                <line x1="12" y1="17" x2="12" y2="21"></line>
                              </svg>
                              <span>Remote</span>
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => pingSingleDevice(device.id)}
                            aria-label={`Periksa status ping untuk ${device.name || device.ip}`}
                          >
                            Ping
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEditModal(device)}
                            aria-label={`Ubah label dan tipe untuk ${device.name || device.ip}`}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger-outline btn-sm"
                            onClick={() => handleDeleteDevice(device.id)}
                            aria-label={`Hapus komputer ${device.name || device.ip} dari pantauan`}
                          >
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Footer Fungsional Sederhana */}
      <footer className="app-footer">
        <div>
          <span>Utilitas Pemantau Jaringan Komputer LAN & WAN (ICMP Ping)</span>
        </div>
      </footer>

      {/* Modal Pindai Subnet (LAN) */}
      {isScanModalOpen && (
        <div className="modal-overlay" role="dialog" aria-labelledby="modalScanTitle" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <h3 id="modalScanTitle" className="modal-title">Pindai Komputer Aktif di Subnet LAN</h3>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setIsScanModalOpen(false)}
                aria-label="Tutup jendela pemindaian"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-instruction">
                Pemindaian rentang alamat IP lokal (LAN) untuk mencari komputer atau perangkat yang sedang aktif di jaringan yang sama.
              </p>

              <form onSubmit={handleStartScan} className="scan-form">
                <div className="scan-inputs-row">
                  <div className="form-group flex-2">
                    <label htmlFor="scanSubnetInput" className="form-label">Awalan Subnet</label>
                    <input
                      type="text"
                      id="scanSubnetInput"
                      className="form-input font-mono"
                      value={scanSubnet}
                      onChange={(e) => setScanSubnet(e.target.value)}
                      placeholder="192.168.8"
                      required
                    />
                  </div>
                  <div className="form-group flex-1">
                    <label htmlFor="scanStartInput" className="form-label">Mulai Host</label>
                    <input
                      type="number"
                      id="scanStartInput"
                      className="form-input font-mono"
                      value={scanStart}
                      min={1}
                      max={254}
                      onChange={(e) => setScanStart(parseInt(e.target.value, 10))}
                      required
                    />
                  </div>
                  <div className="form-group flex-1">
                    <label htmlFor="scanEndInput" className="form-label">Sampai Host</label>
                    <input
                      type="number"
                      id="scanEndInput"
                      className="form-input font-mono"
                      value={scanEnd}
                      min={1}
                      max={254}
                      onChange={(e) => setScanEnd(parseInt(e.target.value, 10))}
                      required
                    />
                  </div>
                </div>

                <div className="scan-btn-row">
                  <button type="submit" className="btn btn-primary" disabled={isScanning}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <span>{isScanning ? 'Sedang Memindai...' : 'Mulai Pemindaian LAN'}</span>
                  </button>
                </div>
              </form>

              {scanStatusMsg && (
                <div className="scan-results-area">
                  <div className="scan-progress-box">
                    {isScanning && <span className="mini-spinner" aria-hidden="true"></span>}
                    <span>{scanStatusMsg}</span>
                  </div>

                  {scanActiveFound.length > 0 && (
                    <div className="scan-found-list">
                      {scanActiveFound.map((dev) => {
                        const isAlready = devices.some(d => d.ip === dev.ip);
                        const isChecked = !!selectedScanIps[dev.ip];
                        return (
                          <div key={dev.ip} className="scan-item">
                            <div className="scan-item-left">
                              <input
                                type="checkbox"
                                id={`chk-scan-${dev.ip}`}
                                className="scan-item-checkbox"
                                checked={isChecked}
                                disabled={isAlready}
                                onChange={(e) => {
                                  setSelectedScanIps(prev => ({
                                    ...prev,
                                    [dev.ip]: e.target.checked
                                  }));
                                }}
                              />
                              <label htmlFor={`chk-scan-${dev.ip}`} className="font-mono">
                                {dev.ip} {dev.hostname ? `(${dev.hostname})` : ''} {isAlready ? '[Sudah dipantau]' : ''}
                              </label>
                            </div>
                            <span className="status-badge badge-online">
                              <span className="badge-dot" aria-hidden="true"></span>
                              <span>Online ({dev.latency})</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsScanModalOpen(false)}
              >
                Batal
              </button>
              {scanActiveFound.length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAddSelectedScanned}
                >
                  Tambahkan Komputer Terpilih
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Label & Tipe */}
      {isEditModalOpen && editingDevice && (
        <div className="modal-overlay" role="dialog" aria-labelledby="modalEditTitle" aria-modal="true">
          <div className="modal-card modal-card-sm">
            <div className="modal-header">
              <h3 id="modalEditTitle" className="modal-title">Ubah Komputer</h3>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setIsEditModalOpen(false)}
                aria-label="Tutup jendela edit"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Alamat IP / Host</label>
                <input
                  type="text"
                  className="form-input font-mono"
                  value={editingDevice.ip}
                  disabled
                />
              </div>
              <div className="form-group">
                <label htmlFor="inputEditName" className="form-label">Label Nama Baru</label>
                <input
                  type="text"
                  id="inputEditName"
                  className="form-input"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  placeholder="Misal: PC Kasir 01"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="selectEditType" className="form-label">Tipe Jaringan</label>
                <select
                  id="selectEditType"
                  className="form-select"
                  value={editTypeValue}
                  onChange={(e) => setEditTypeValue(e.target.value)}
                >
                  <option value="LAN">LAN (Jaringan Lokal)</option>
                  <option value="WAN">WAN (Internet / Publik)</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="inputEditUsername" className="form-label">Username Windows (Remote Desktop)</label>
                <input
                  type="text"
                  id="inputEditUsername"
                  className="form-input"
                  value={editUsernameValue}
                  onChange={(e) => setEditUsernameValue(e.target.value)}
                  placeholder="Contoh: Administrator atau kasir"
                  autoComplete="off"
                />
                <span className="form-hint">Username login Windows di komputer tujuan untuk auto-fill file RDP.</span>
              </div>
              <div className="form-group">
                <label htmlFor="inputEditPassword" className="form-label">Password Windows (Remote Desktop)</label>
                <div className="password-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="inputEditPassword"
                    className="form-input"
                    value={editPasswordValue}
                    onChange={(e) => setEditPasswordValue(e.target.value)}
                    placeholder="Masukkan password login Windows (opsional)"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="btn-toggle-password"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                    title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  >
                    {showPassword ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
                <span className="form-hint">Disimpan lokal di browser untuk pendaftaran kredensial otomatis saat remote.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsEditModalOpen(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveEdit}
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Peringatan Username Windows Kosong */}
      {remoteWarnDevice && (
        <div className="modal-overlay" role="dialog" aria-labelledby="modalWarnTitle" aria-modal="true">
          <div className="modal-card modal-card-sm">
            <div className="modal-header">
              <h3 id="modalWarnTitle" className="modal-title">Kredensial Belum Lengkap</h3>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setRemoteWarnDevice(null)}
                aria-label="Tutup jendela peringatan"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-icon-warn" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
              <p className="modal-instruction" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                Username Windows untuk komputer <strong>{remoteWarnDevice.name || remoteWarnDevice.ip}</strong> belum diisi.
              </p>
              <p className="modal-instruction">
                Untuk koneksi instan otomatis tanpa dialog login berulang, lengkapi username Windows di menu <strong>Edit</strong>. Anda juga dapat melanjutkan remote sekarang (Windows akan menanyakan username dan password secara manual).
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const targetDev = remoteWarnDevice;
                  setRemoteWarnDevice(null);
                  openEditModal(targetDev);
                }}
              >
                Isi Kredensial Sekarang
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  const targetDev = remoteWarnDevice;
                  setRemoteWarnDevice(null);
                  await executeRemoteCall(targetDev);
                }}
              >
                Lanjutkan Remote Saja
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

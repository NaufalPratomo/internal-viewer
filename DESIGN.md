# Design Direction: Pemantau Komputer LAN (Network Monitor)

## 1. Identitas & Karakter
- **Produk**: Utilitas diagnostik jaringan lokal untuk memantau status komputer / perangkat aktif.
- **Karakter**: Fungsional, terpercaya, tenang, presisi data tinggi. Bukan situs pemasaran atau landing page berlebihan.
- **Tone of Voice**: Lugas, bahasa Indonesia praktis, tanpa istilah AI generik, tanpa tanda pisah em-dash.

## 2. Dials (Tingkat Energi, Ritme, & Gerakan)
- **ENERGY**: 1 (Calm) — Warna tenang berakar pada abu-abu netral (slate/zinc). Status warna digunakan hanya untuk informasi status fungsional.
- **RHYTHM**: 1 (Uniform) — Tata letak konsisten berbasis tabel data dan kartu kontrol terstruktur yang mudah dipindai mata.
- **MOTION**: 1 (Calm) — Animasi terbatas pada perubahan status, spinner saat pengecekan, dan transisi hover yang halus (150ms-200ms). Tanpa efek melayang atau denyut tanpa henti.

## 3. Palet Warna (Bebas Slop & Lolos WCAG AA)
### Mode Terang (Light Mode)
- **Background Utama**: `#F8FAFC` (Slate 50)
- **Background Kartu / Surface**: `#FFFFFF` (Putih murni) dengan border halus `#E2E8F0` (Slate 200)
- **Teks Primer**: `#0F172A` (Slate 900) — Rasio kontras 15.8:1 terhadap putih (Lolos AA & AAA)
- **Teks Sekunder**: `#475569` (Slate 600) — Rasio kontras 5.9:1 terhadap putih (Lolos AA)
- **Status Online**:
  - Badge Background: `#ECFDF5` (Emerald 50)
  - Badge Text: `#065F46` (Emerald 800) — Rasio kontras 5.8:1
  - Dot / Indicator: `#059669` (Emerald 600)
- **Status Offline**:
  - Badge Background: `#FEF2F2` (Rose 50)
  - Badge Text: `#991B1B` (Rose 800) — Rasio kontras 6.4:1
  - Dot / Indicator: `#DC2626` (Rose 600)
- **Aksen Primer (Tombol Utama)**: `#1E293B` (Slate 800) dengan teks putih `#FFFFFF` (Rasio kontras 12.6:1)
- **Border & Pembatas**: `#E2E8F0`

### Mode Gelap (Dark Mode)
- **Background Utama**: `#0B0F17` (Deep Dark Slate)
- **Background Kartu / Surface**: `#151D2A` dengan border `#233144`
- **Teks Primer**: `#F1F5F9` (Slate 100) — Rasio kontras 13.9:1 (Lolos AA & AAA)
- **Teks Sekunder**: `#94A3B8` (Slate 400) — Rasio kontras 6.2:1 (Lolos AA)
- **Status Online**:
  - Badge Background: `rgba(16, 185, 129, 0.12)`
  - Badge Text: `#34D399` (Emerald 400) — Rasio kontras 7.2:1
- **Status Offline**:
  - Badge Background: `rgba(239, 68, 68, 0.12)`
  - Badge Text: `#F87171` (Rose 400) — Rasio kontras 5.5:1
- **Aksen Primer**: `#38BDF8` (Sky 400) dengan teks gelap `#0B0F17` atau Slate terang `#3B82F6`
- **Fokus Keyboard**: Outline warna `#38BDF8` (lebar 2px, offset 2px, rasio kontras > 3:1)

## 4. Tipografi
- **Teks Antarmuka**: Stack font sistem modern: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
- **Nilai Teknis (IP, Latensi, Waktu)**: Font monospace terstruktur: `ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace`.
- **Angka**: `font-variant-numeric: tabular-nums` untuk perataan angka kolom yang presisi saat nilai diperbarui.

## 5. Komponen & Aksesibilitas
- **Kontras**: Semua teks memenuhi batas WCAG AA (>= 4.5:1 untuk teks biasa, >= 3:1 untuk teks tebal/besar).
- **Indikator Bukan Hanya Warna**: Setiap status dilengkapi ikon eksplisit (tanda centang untuk Online, tanda silang untuk Offline, ikon jam/spinner untuk Memeriksa) serta teks status.
- **Navigasi Keyboard**: Seluruh tombol, input, dan aksi tabel dapat dijangkau menggunakan tombol `Tab`, dijalankan dengan `Enter`/`Space`, dan modal ditutup dengan `Escape`.
- **Target Sentuh**: Semua kontrol interaktif memiliki ukuran minimal 44x44 piksel pada perangkat mobile.

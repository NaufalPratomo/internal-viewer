import './globals.css';

export const metadata = {
  title: 'Pemantau Komputer LAN - Monitor Status Jaringan Lokal',
  description: 'Aplikasi web pemantau status aktif atau offline komputer pada jaringan lokal (LAN).',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        {children}
      </body>
    </html>
  );
}

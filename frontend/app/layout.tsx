import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '../lib/auth/auth-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'Renovo CRM',
  description: 'CRM built for pressure washing companies',
};

// Was missing entirely. Without this, mobile Safari has no way to know the
// page is meant to fit the real screen width, so it falls back to
// rendering everything at a fake ~980px desktop-width canvas and scaling
// the whole thing down to fit — which is almost certainly the actual
// cause of "have to zoom out to see the full page" and "everything looks
// small," not just on Estimates but on every page in the app.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

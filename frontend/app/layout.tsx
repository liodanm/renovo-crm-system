import type { Metadata } from 'next';
import { AuthProvider } from '../lib/auth/auth-context';
import './globals.css';

export const metadata: Metadata = {
  title: 'Renovo CRM',
  description: 'CRM built for pressure washing companies',
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

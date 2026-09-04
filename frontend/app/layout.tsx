import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '../lib/auth/auth-context';
import { ThemeProvider } from '../lib/theme/theme-context';
import { BrandThemeInjector } from '../lib/theme/brand-theme-injector';
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

// Runs before React hydrates, directly in <head> — the only way to apply
// the stored theme class to <html> before first paint. Without this, every
// page load would flash light mode for a frame even when dark mode is the
// stored preference, since ThemeProvider's own effect can't run until
// after the initial render. Wrapped in try/catch: localStorage can throw
// in rare embedded/private-browsing contexts, and the correct fallback
// there is just "render light," not a crashed page.
const themeInitScript = `
  try {
    var t = window.localStorage.getItem('renovo_theme');
    var wantsDark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (wantsDark) document.documentElement.classList.add('dark');
  } catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <ThemeProvider>
          <AuthProvider>
            <BrandThemeInjector />
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

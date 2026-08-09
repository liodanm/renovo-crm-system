import { authApi } from '../../lib/api/auth';
import { useOAuthProviders } from '../../lib/hooks/use-oauth-providers';

export function GoogleLoginButton() {
  return (
    <a
      href={authApi.googleLoginUrl()}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z" />
        <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
      </svg>
      Continue with Google
    </a>
  );
}

export function MicrosoftLoginButton() {
  return (
    <a
      href={authApi.microsoftLoginUrl()}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <rect x="0" y="0" width="8.5" height="8.5" fill="#F25022" />
        <rect x="9.5" y="0" width="8.5" height="8.5" fill="#7FBA00" />
        <rect x="0" y="9.5" width="8.5" height="8.5" fill="#00A4EF" />
        <rect x="9.5" y="9.5" width="8.5" height="8.5" fill="#FFB900" />
      </svg>
      Continue with Microsoft
    </a>
  );
}

/**
 * The one place login/register pages should reach for OAuth — includes
 * its own divider, so a company with neither Google nor Microsoft
 * configured (true for this app today) renders nothing here at all,
 * not an empty "or continue with" divider above two missing buttons.
 */
export function OAuthButtonsSection() {
  const { google, microsoft, isLoading } = useOAuthProviders();
  if (isLoading || (!google && !microsoft)) return null;

  return (
    <>
      <div className="space-y-3">
        {google && <GoogleLoginButton />}
        {microsoft && <MicrosoftLoginButton />}
      </div>
      <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
        <div className="h-px flex-1 bg-slate-200" />
        OR
        <div className="h-px flex-1 bg-slate-200" />
      </div>
    </>
  );
}

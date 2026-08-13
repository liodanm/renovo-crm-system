import { AppShell } from '../../components/layout/AppShell';

/**
 * Previously this also rendered a persistent left-side nav column here —
 * its own search box, plus a nav list capped to a fixed viewport height
 * with `overflow-y-auto` (the source of the inner scrollbar). That nav
 * has moved to the new /settings landing page as a card grid instead.
 * Each individual settings detail page now supplies its own
 * "← Settings" back link via SettingsSectionShell, so it reads as its
 * own full-width screen rather than living inside a permanent two-pane
 * layout.
 *
 * max-w-5xl is a deliberate middle ground: wide enough for the landing
 * page's two-column card grid, still a comfortable reading width for
 * the narrower single-column settings forms nested inside it — none of
 * those forms use their full available width anyway (they cap their own
 * fields at sensible sizes internally).
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
    </AppShell>
  );
}

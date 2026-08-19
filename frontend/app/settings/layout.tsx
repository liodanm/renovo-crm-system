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
 * max-w-[1600px] matches the Dashboard's content width exactly (see
 * app/page.tsx) — a deliberate consistency choice so every top-level
 * screen in the app shares the same outer width instead of Settings
 * alone reading narrower. The individual settings forms nested inside
 * still don't use the full available width (they cap their own fields
 * at sensible sizes internally, same as before) — this only widens the
 * outer frame, not the forms themselves.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">{children}</div>
    </AppShell>
  );
}

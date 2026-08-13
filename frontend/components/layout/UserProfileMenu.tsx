'use client';

import { LogOut, ChevronsUpDown, UserCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth/auth-context';
import { cn } from '../../lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';

interface UserProfileMenuProps {
  collapsed: boolean;
}

// CurrentUser (lib/api/auth.ts) only carries email, roleName, and
// companyId today — no display name and no company name field exist on
// the backend yet. Rather than invent placeholder data, this derives a
// readable name from the email's local part and shows the role as the
// second line. Swap in real firstName/lastName/companyName the day
// those fields exist — this component's shape won't need to change,
// only what it's fed.
function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function roleLabel(roleName: string): string {
  return roleName.charAt(0).toUpperCase() + roleName.slice(1);
}

export function UserProfileMenu({ collapsed }: UserProfileMenuProps) {
  const { user, logout } = useAuth();
  if (!user) return null;

  const name = displayNameFromEmail(user.email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors',
            'hover:bg-[var(--sidebar-bg-hover)] focus-visible:ring-2 focus-visible:ring-[var(--sidebar-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sidebar-bg)]',
            collapsed && 'justify-center px-0',
          )}
          aria-label={`Account menu for ${name}`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--sidebar-accent)] text-xs font-semibold text-[var(--sidebar-bg)]">
            {initials(name)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[var(--sidebar-text-active)]">{name}</span>
                <span className="block truncate text-xs text-[var(--sidebar-text-muted)]">{roleLabel(user.roleName)}</span>
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--sidebar-text-muted)]" aria-hidden="true" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{name}</span>
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <UserCircle className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
          Account settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout()} className="text-red-600 dark:text-red-400 focus:bg-red-50 dark:bg-red-950 focus:text-red-700 dark:text-red-300">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

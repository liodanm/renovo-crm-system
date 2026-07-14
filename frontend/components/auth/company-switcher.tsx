'use client';

import { useEffect, useState } from 'react';
import { authApi, CompanyMembership } from '../../lib/api/auth';
import { setTokens } from '../../lib/auth/token-storage';
import { useAuth } from '../../lib/auth/auth-context';

export function CompanySwitcher() {
  const { user, refetchUser } = useAuth();
  const [companies, setCompanies] = useState<CompanyMembership[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    authApi.myCompanies().then(setCompanies).catch(() => setCompanies([]));
  }, [user?.userId]);

  // A user with access to only one company doesn't need a switcher at all.
  if (companies.length <= 1) return null;

  async function handleSwitch(companyId: string) {
    if (companyId === user?.companyId) {
      setIsOpen(false);
      return;
    }
    setIsSwitching(true);
    try {
      const tokens = await authApi.switchCompany(companyId);
      setTokens(tokens);
      await refetchUser();
    } finally {
      setIsSwitching(false);
      setIsOpen(false);
    }
  }

  const current = companies.find((c) => c.companyId === user?.companyId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        disabled={isSwitching}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        {current?.companyName ?? 'Select company'}
        <span className="text-xs text-slate-400">▾</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {companies.map((c) => (
            <button
              key={c.companyId}
              onClick={() => handleSwitch(c.companyId)}
              className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                c.companyId === user?.companyId ? 'bg-cyan-50/60' : ''
              }`}
            >
              <span className="font-medium text-slate-900">{c.companyName}</span>
              <span className="text-xs capitalize text-slate-500">{c.role.replace('_', ' ')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

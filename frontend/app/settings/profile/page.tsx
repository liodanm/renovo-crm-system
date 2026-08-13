'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { settingsApi } from '../../../lib/api/settings';
import { SettingsSectionShell } from '../../../components/settings/SettingsSectionShell';
import { ApiError } from '../../../lib/api/api-client';

const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Phoenix'];
const DATE_FORMATS = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'];
const inputClass = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-3 text-base lg:py-2 lg:text-sm dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500';

export default function ProfileSettingsPage() {
  const { data: profile, mutate } = useSWR('settings-profile', () => settingsApi.getProfile());

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [timezone, setTimezone] = useState('');
  const [dateFormat, setDateFormat] = useState('MM/DD/YYYY');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setPhone(profile.phone ?? '');
      setTimezone(profile.timezone ?? '');
      setDateFormat(profile.dateFormat);
      setHasChanges(false);
    }
  }, [profile]);

  function track<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setHasChanges(true); };
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      await settingsApi.updateProfile({ firstName, lastName, phone: phone || undefined, timezone: timezone || undefined, dateFormat });
      await mutate();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong saving your profile.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (profile) {
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setPhone(profile.phone ?? '');
      setTimezone(profile.timezone ?? '');
      setDateFormat(profile.dateFormat);
    }
    setHasChanges(false);
  }

  return (
    <SettingsSectionShell
      title="Profile"
      description="Your personal information and preferences."
      hasUnsavedChanges={hasChanges}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onCancel={handleCancel}
    >
      {!profile ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">First Name</label>
                <input value={firstName} onChange={(e) => track(setFirstName)(e.target.value)} className={`${inputClass} mt-1`} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Last Name</label>
                <input value={lastName} onChange={(e) => track(setLastName)(e.target.value)} className={`${inputClass} mt-1`} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Email</label>
                <input value={profile.email} disabled className={`${inputClass} mt-1 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500`} />
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Contact support to change your email address.</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Phone</label>
                <input value={phone} onChange={(e) => track(setPhone)(e.target.value)} className={`${inputClass} mt-1`} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Time Zone</label>
                <select value={timezone} onChange={(e) => track(setTimezone)(e.target.value)} className={`${inputClass} mt-1`}>
                  <option value="">Use business default</option>
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Date Format</label>
                <select value={dateFormat} onChange={(e) => track(setDateFormat)(e.target.value)} className={`${inputClass} mt-1`}>
                  {DATE_FORMATS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-500">Language preferences are coming soon — currently English only.</p>
          </div>

          <ChangePasswordCard />
        </>
      )}
    </SettingsSectionShell>
  );
}

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  async function handleChangePassword() {
    setIsSaving(true);
    setMessage(null);
    try {
      await settingsApi.changePassword({ currentPassword, newPassword });
      setMessage({ type: 'success', text: 'Password updated.' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Could not change your password.' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Password</h2>
      {message && <p className={`mt-2 text-xs ${message.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600'}`}>{message.text}</p>}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Current Password</label>
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className={`${inputClass} mt-1`} />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">New Password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={`${inputClass} mt-1`} />
        </div>
      </div>
      <button
        onClick={handleChangePassword}
        disabled={isSaving || !currentPassword || !newPassword}
        className="mt-3 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-800 disabled:opacity-50"
      >
        {isSaving ? 'Updating…' : 'Change Password'}
      </button>
    </div>
  );
}

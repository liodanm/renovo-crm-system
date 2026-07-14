'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { customersApi } from '../../../lib/api/customers';
import { useAuth } from '../../../lib/auth/auth-context';
import { CardSkeleton, CardError, CardEmpty } from '../../dashboard/dashboard-card';

export function NotesTab({ customerId }: { customerId: string }) {
  const { user } = useAuth();
  const { data: notes, error, isLoading, mutate } = useSWR([`notes`, customerId], () => customersApi.listNotes(customerId));
  const [body, setBody] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleAdd() {
    if (!body.trim()) return;
    setIsSaving(true);
    try {
      await customersApi.createNote(customerId, { body: body.trim() });
      setBody('');
      mutate();
    } finally {
      setIsSaving(false);
    }
  }

  async function togglePin(noteId: string, isPinned: boolean) {
    await customersApi.updateNote(customerId, noteId, { isPinned: !isPinned });
    mutate();
  }

  async function handleDelete(noteId: string) {
    if (!confirm('Delete this note?')) return;
    await customersApi.deleteNote(customerId, noteId);
    mutate();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note about this customer…"
          rows={2}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[var(--color-brand)] focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={isSaving || !body.trim()}
          className="self-end rounded-lg bg-[var(--color-brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-brand-dark)] disabled:opacity-50"
        >
          Add
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {isLoading && <CardSkeleton lines={3} />}
        {error && <CardError />}
        {!isLoading && !error && notes && notes.length === 0 && <CardEmpty message="No notes yet." />}
        {!isLoading &&
          !error &&
          notes?.map((n) => (
            <div key={n.id} className={`rounded-lg border p-3 ${n.isPinned ? 'border-amber-200 bg-amber-50/50' : 'border-slate-100'}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm text-slate-700">{n.body}</p>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => togglePin(n.id, n.isPinned)}
                    className="text-xs text-slate-400 hover:text-amber-600"
                    title={n.isPinned ? 'Unpin' : 'Pin'}
                  >
                    {n.isPinned ? '★' : '☆'}
                  </button>
                  {n.authorUserId === user?.userId && (
                    <button onClick={() => handleDelete(n.id)} className="text-xs text-slate-400 hover:text-red-600">
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { normalizeUsername, validateUsername } from '@/lib/auth/username';

type Profile = { uid: string; username: string; created_at: string };

export default function AccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sessionMissing, setSessionMissing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // form state
  const [username, setUsername] = useState('');
  const normalized = useMemo(() => normalizeUsername(username), [username]);
  const errorText = useMemo(() => validateUsername(normalized), [normalized]);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);


  useEffect(() => {
  if (sessionMissing) {
    router.replace('/login');
  }
}, [sessionMissing, router])

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!user) {
        setSessionMissing(true);
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // fetch profile
      const { data, error } = await supabase
        .from('profiles')
        .select('uid, username, created_at')
        .eq('uid', user.id)
        .maybeSingle();

      if (error) {
        // if table is empty for this uid, we'll show the create form
        console.error(error);
      }
      setProfile(data ?? null);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitErr(null);
    if (errorText) { setSubmitErr(errorText); return; }
    if (!userId) return;

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .insert({ uid: userId, username: normalized });

    setSaving(false);
      const hasCode = (e: unknown): e is { code: string } =>
        typeof e === 'object' && e !== null && 'code' in e && typeof (e as Record<string, unknown>).code === 'string';

      if (error) {
        if (hasCode(error) && error.code === '23505') {
          setSubmitErr('Username is taken. Try another.');
        } else {
          setSubmitErr('message' in error ? (error as { message: string }).message : 'Unknown error');
        }
        return;
      }
    // reload view
    setProfile({ uid: userId, username: normalized, created_at: new Date().toISOString() });
  };

  const onUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitErr(null);
    if (errorText) { setSubmitErr(errorText); return; }
    if (!userId) return;

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ username: normalized })
      .eq('uid', userId);
    setSaving(false);
      if (error) {
        if ('code' in error && (error as { code: string }).code === '23505') {
          setSubmitErr('Username is taken. Try another.');
        } else {
          setSubmitErr((error as { message: string }).message);
        }
        return;
      }
    setProfile((p) => (p ? { ...p, username: normalized } : p));
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

if (loading) return <div className="p-6">Loading…</div>;

// În loc de a apela router.replace aici:
if (sessionMissing) {
  return <div className="p-6">Redirecting…</div>; // sau null
}

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Account</h1>
        <button className="rounded bg-neutral-900 text-white px-3 py-1" onClick={onLogout}>Log out</button>
      </div>

      {!profile ? (
        <form onSubmit={onCreate} className="space-y-3 border rounded-xl p-4">
          <h2 className="font-semibold">Choose your username</h2>
          <input
            className="w-full rounded border p-2"
            placeholder="yourname"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <p className="text-sm text-neutral-500">Allowed: a–z, 0–9, underscore. 3–20 chars. Must start with a letter.</p>
          {submitErr && <p className="text-sm text-red-500">{submitErr}</p>}
          <button className="rounded bg-black text-white px-3 py-2" disabled={!!errorText || saving}>
            {saving ? 'Saving…' : 'Save username'}
          </button>
        </form>
      ) : (
        <form onSubmit={onUpdate} className="space-y-3 border rounded-xl p-4">
          <h2 className="font-semibold">Profile</h2>
          <div className="text-sm text-neutral-600">Current username: <span className="font-mono">{profile.username}</span></div>
          <label className="block text-sm mt-2">Update username</label>
          <input
            className="w-full rounded border p-2"
            placeholder="newname"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          {submitErr && <p className="text-sm text-red-500">{submitErr}</p>}
          <button className="rounded bg-black text-white px-3 py-2" disabled={!!errorText || saving}>
            {saving ? 'Updating…' : 'Update'}
          </button>
        </form>
      )}
    </div>
  );
}

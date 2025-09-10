'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    // With confirmations disabled, user is signed in immediately
    router.replace('/account');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 border rounded-xl p-6">
        <h1 className="text-xl font-semibold">Create account</h1>
        <input className="w-full rounded border p-2" type="email" placeholder="email@example.com"
               value={email} onChange={(e) => setEmail(e.target.value)} required/>
        <input className="w-full rounded border p-2" type="password" placeholder="Min 6 characters"
               value={password} onChange={(e) => setPassword(e.target.value)} required/>
        {err && <p className="text-red-500 text-sm">{err}</p>}
        <button className="w-full rounded bg-black text-white py-2" disabled={loading}>
          {loading ? 'Creating…' : 'Create account'}
        </button>
        <p className="text-sm text-center">
          Have an account? <a className="underline" href="/login">Log in</a>
        </p>
      </form>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    router.replace('/account');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 border rounded-xl p-6">
        <h1 className="text-xl font-semibold">Log in</h1>
        <input className="w-full rounded border p-2" type="email" placeholder="email@example.com"
               value={email} onChange={(e) => setEmail(e.target.value)} required/>
        <input className="w-full rounded border p-2" type="password" placeholder="••••••••"
               value={password} onChange={(e) => setPassword(e.target.value)} required/>
        {err && <p className="text-red-500 text-sm">{err}</p>}
        <button className="w-full rounded bg-black text-white py-2" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-sm text-center">
          No account? <a className="underline" href="/register">Register</a>
        </p>
      </form>
    </div>
  );
}

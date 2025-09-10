'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setUser(data.user ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      sub.subscription.unsubscribe();
      active = false;
    };
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const LinkItem = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <Link
      href={href}
      className={`px-2 py-1 rounded ${
        pathname === href ? 'bg-neutral-800 text-white' : 'hover:bg-neutral-800/60'
      }`}
    >
      {children}
    </Link>
  );

  return (
    <header className="w-full border-b border-neutral-800">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold">3D Card Game</Link>
        <nav className="flex items-center gap-2">
          <LinkItem href="/debug/3d">Debug 3D</LinkItem>
          <LinkItem href="/debug/supabase">Supabase</LinkItem>
        </nav>
        <div className="flex items-center gap-2">
          {loading ? (
            <span className="text-sm text-neutral-500">…</span>
          ) : user ? (
            <>
              <LinkItem href="/account">Account</LinkItem>
              <button onClick={logout} className="px-2 py-1 rounded bg-black text-white">
                Logout
              </button>
            </>
          ) : (
            <>
              <LinkItem href="/login">Login</LinkItem>
              <LinkItem href="/register">Register</LinkItem>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

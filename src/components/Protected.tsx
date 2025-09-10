'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

export default function Protected({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data.user) {
        router.replace('/login');
      } else {
        setUser(data.user);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [router]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (!user) return <div className="p-6">Redirecting…</div>;
  return <>{children}</>;
}

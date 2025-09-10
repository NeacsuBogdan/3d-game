'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function Protected({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data.user) {
        router.replace('/login'); // redirect instead of 404
      } else {
        setOk(true);
      }
      setChecking(false);
    })();
    return () => { active = false; };
  }, [router]);

  if (checking) return null;
  return ok ? <>{children}</> : null;
}

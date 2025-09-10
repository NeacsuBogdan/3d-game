import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function getServerSupabase() {
  const cookieStore = await cookies(); // ← cookies() e async în setup-ul tău

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},   // no-ops here; we only need reads
        remove() {},
      },
    }
  );

  return supabase;
}

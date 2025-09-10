import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function SupabaseDebugPage() {
  const { data: cards, error: cardsErr } = await supabase
    .from('cards_public')
    .select('id, situation')
    .limit(10);

  const { data: chars, error: charsErr } = await supabase
    .from('characters')
    .select('id, label, model_url')
    .eq('enabled', true)
    .order('label');

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Supabase debug</h1>

      <section>
        <h2 className="font-semibold">cards_public (10)</h2>
        {cardsErr ? <pre>{cardsErr.message}</pre> : (
          <ul className="list-disc pl-6">
            {cards?.map(c => <li key={c.id}>{c.situation}</li>)}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-semibold">characters</h2>
        {charsErr ? <pre>{charsErr.message}</pre> : (
          <ul className="list-disc pl-6">
            {chars?.map(ch => <li key={ch.id}>{ch.label} — {ch.model_url}</li>)}
          </ul>
        )}
      </section>
    </div>
  );
}

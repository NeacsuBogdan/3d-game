import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import type { CharacterRow } from "../_shared/types";

export function useCharacters() {
  const [characters, setCharacters] = useState<CharacterRow[]>([]);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("characters")
      .select("id, label, model_url, enabled");
    if (!error && Array.isArray(data)) {
      setCharacters(data.filter((c) => c.enabled));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { characters, refresh } as const;
}

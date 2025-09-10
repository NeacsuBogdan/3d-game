-- Enable RLS and add self-only policies for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_select_self'
  ) THEN
    CREATE POLICY profiles_select_self
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (uid = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_insert_self'
  ) THEN
    CREATE POLICY profiles_insert_self
      ON public.profiles
      FOR INSERT
      TO authenticated
      WITH CHECK (uid = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_update_self'
  ) THEN
    CREATE POLICY profiles_update_self
      ON public.profiles
      FOR UPDATE
      TO authenticated
      USING (uid = auth.uid())
      WITH CHECK (uid = auth.uid());
  END IF;
END
$$ LANGUAGE plpgsql;
-- User profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  company_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, company_name)
  VALUES (
    NEW.id,
    left(coalesce(NEW.raw_user_meta_data->>'display_name', ''), 120),
    left(coalesce(NEW.raw_user_meta_data->>'company_name', ''), 160)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Forge projects, private to each user
CREATE TABLE public.forge_projects (
  user_id uuid NOT NULL,
  project_id text NOT NULL,
  name text NOT NULL DEFAULT 'Untitled project',
  stage text NOT NULL DEFAULT '',
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id),
  CONSTRAINT forge_projects_id_len CHECK (char_length(project_id) BETWEEN 1 AND 120),
  CONSTRAINT forge_projects_size CHECK (pg_column_size(data) < 8000000)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.forge_projects TO authenticated;
GRANT ALL ON public.forge_projects TO service_role;
ALTER TABLE public.forge_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own projects" ON public.forge_projects FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own projects" ON public.forge_projects FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own projects" ON public.forge_projects FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own projects" ON public.forge_projects FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER forge_projects_touch BEFORE UPDATE ON public.forge_projects
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- AI request log for per-user rate limits (written only by the server)
CREATE TABLE public.ai_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_requests_user_time ON public.ai_requests (user_id, created_at DESC);
GRANT SELECT ON public.ai_requests TO authenticated;
GRANT ALL ON public.ai_requests TO service_role;
ALTER TABLE public.ai_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own AI requests" ON public.ai_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Atomically check and record an AI request for the signed-in user.
CREATE OR REPLACE FUNCTION public.claim_ai_request(_per_minute int, _per_day int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  minute_count int;
  day_count int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(uid::text));
  SELECT count(*) INTO minute_count FROM ai_requests WHERE user_id = uid AND created_at > now() - interval '1 minute';
  SELECT count(*) INTO day_count FROM ai_requests WHERE user_id = uid AND created_at > now() - interval '1 day';
  IF minute_count >= _per_minute THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'minute', 'used_today', day_count);
  END IF;
  IF day_count >= _per_day THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'day', 'used_today', day_count);
  END IF;
  INSERT INTO ai_requests (user_id) VALUES (uid);
  DELETE FROM ai_requests WHERE user_id = uid AND created_at < now() - interval '2 days';
  RETURN jsonb_build_object('allowed', true, 'used_today', day_count + 1);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_ai_request(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ai_request(int, int) TO authenticated;
-- The Connect security hardening.
-- Safe to re-run. Apply in Supabase SQL Editor after taking a database backup.
BEGIN;

-- Staff authorization includes all current editorial roles.
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text IN (
        'admin', 'editor', 'news_editor', 'sub_editor', 'reporter'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

-- Keep account creation, but never grant editorial permissions automatically.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- The legacy RPC can no longer make its caller an admin.
-- Kept as a read-only compatibility check so older deployed code does not fail.
CREATE OR REPLACE FUNCTION public.ensure_first_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role::text IN ('admin', 'editor')
  );
$$;

REVOKE ALL ON FUNCTION public.ensure_first_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_first_admin() TO authenticated, service_role;


-- Articles: published rows are public, all changes are staff-only.
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "published articles public read" ON public.articles;
DROP POLICY IF EXISTS "staff read all articles" ON public.articles;
DROP POLICY IF EXISTS "staff insert articles" ON public.articles;
DROP POLICY IF EXISTS "staff update articles" ON public.articles;
DROP POLICY IF EXISTS "staff delete articles" ON public.articles;

CREATE POLICY "published articles public read"
  ON public.articles FOR SELECT
  USING (status = 'published');

CREATE POLICY "staff read all articles"
  ON public.articles FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff insert articles"
  ON public.articles FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff update articles"
  ON public.articles FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff delete articles"
  ON public.articles FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE public.articles FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.articles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.articles TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.articles TO service_role;


-- Categories: public read, administrators only for changes.
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "categories public read" ON public.categories;
DROP POLICY IF EXISTS "admins manage categories" ON public.categories;

CREATE POLICY "categories public read"
  ON public.categories FOR SELECT USING (true);

CREATE POLICY "admins manage categories"
  ON public.categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL PRIVILEGES ON TABLE public.categories FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.categories TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.categories TO service_role;


-- Writer public fields are readable; writer emails are server-side only.
ALTER TABLE public.writers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS writers_read ON public.writers;
DROP POLICY IF EXISTS writers_write ON public.writers;

CREATE POLICY writers_read
  ON public.writers FOR SELECT USING (true);

CREATE POLICY writers_write
  ON public.writers FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

REVOKE SELECT ON TABLE public.writers FROM anon, authenticated, PUBLIC;
REVOKE SELECT (email) ON TABLE public.writers FROM anon, authenticated, PUBLIC;
GRANT SELECT (id, name, slug, bio, photo_url, managed_by_desk, created_at)
  ON TABLE public.writers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.writers TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.writers TO service_role;


-- Internal AI Desk tables are accessible only to editorial staff.
ALTER TABLE public.news_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desk_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desk_story_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desk_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desk_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desk_source_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desk_fact_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desk_discovery_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.desk_story_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS news_sources_read ON public.news_sources;
DROP POLICY IF EXISTS news_sources_write ON public.news_sources;
DROP POLICY IF EXISTS news_sources_staff_all ON public.news_sources;
CREATE POLICY news_sources_staff_all
  ON public.news_sources FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS desk_stories_all ON public.desk_stories;
DROP POLICY IF EXISTS desk_stories_staff_all ON public.desk_stories;
CREATE POLICY desk_stories_staff_all
  ON public.desk_stories FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS desk_story_sources_all ON public.desk_story_sources;
DROP POLICY IF EXISTS desk_story_sources_staff_all ON public.desk_story_sources;
CREATE POLICY desk_story_sources_staff_all
  ON public.desk_story_sources FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS desk_jobs_all ON public.desk_jobs;
DROP POLICY IF EXISTS desk_jobs_staff_all ON public.desk_jobs;
CREATE POLICY desk_jobs_staff_all
  ON public.desk_jobs FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS desk_settings_all ON public.desk_settings;
DROP POLICY IF EXISTS desk_settings_staff_all ON public.desk_settings;
CREATE POLICY desk_settings_staff_all
  ON public.desk_settings FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS desk_source_claims_all ON public.desk_source_claims;
DROP POLICY IF EXISTS desk_source_claims_staff_all ON public.desk_source_claims;
CREATE POLICY desk_source_claims_staff_all
  ON public.desk_source_claims FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS desk_fact_checks_all ON public.desk_fact_checks;
DROP POLICY IF EXISTS desk_fact_checks_staff_all ON public.desk_fact_checks;
CREATE POLICY desk_fact_checks_staff_all
  ON public.desk_fact_checks FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS desk_discovery_hits_all ON public.desk_discovery_hits;
DROP POLICY IF EXISTS desk_discovery_hits_staff_all ON public.desk_discovery_hits;
CREATE POLICY desk_discovery_hits_staff_all
  ON public.desk_discovery_hits FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS desk_story_images_staff_all ON public.desk_story_images;
CREATE POLICY desk_story_images_staff_all
  ON public.desk_story_images FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

REVOKE ALL PRIVILEGES ON TABLE
  public.news_sources,
  public.desk_stories,
  public.desk_story_sources,
  public.desk_jobs,
  public.desk_settings,
  public.desk_source_claims,
  public.desk_fact_checks,
  public.desk_discovery_hits,
  public.desk_story_images
FROM anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.news_sources,
  public.desk_stories,
  public.desk_story_sources,
  public.desk_jobs,
  public.desk_settings,
  public.desk_source_claims,
  public.desk_fact_checks,
  public.desk_discovery_hits,
  public.desk_story_images
TO authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.news_sources,
  public.desk_stories,
  public.desk_story_sources,
  public.desk_jobs,
  public.desk_settings,
  public.desk_source_claims,
  public.desk_fact_checks,
  public.desk_discovery_hits,
  public.desk_story_images
TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

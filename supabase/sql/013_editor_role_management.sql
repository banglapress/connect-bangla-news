-- Explicit privileges and admin-only row policies for role management.
-- Apply after a backup. Safe to rerun.
BEGIN;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.user_roles
FROM anon, PUBLIC, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.user_roles TO authenticated;

GRANT ALL PRIVILEGES
ON TABLE public.user_roles TO service_role;

DROP POLICY IF EXISTS "own roles readable" ON public.user_roles;
CREATE POLICY "own roles readable"
ON public.user_roles FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "admins insert roles" ON public.user_roles;
CREATE POLICY "admins insert roles"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins update roles" ON public.user_roles;
CREATE POLICY "admins update roles"
ON public.user_roles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins delete roles" ON public.user_roles;
CREATE POLICY "admins delete roles"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Do not allow an accidental action to remove the final administrator.
CREATE OR REPLACE FUNCTION public.protect_last_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count integer;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role::text = 'admin')
     OR (TG_OP = 'UPDATE' AND OLD.role::text = 'admin' AND NEW.role::text <> 'admin') THEN
    SELECT count(*) INTO admin_count
    FROM public.user_roles
    WHERE role::text = 'admin';

    IF admin_count <= 1 THEN
      RAISE EXCEPTION 'অন্তত একজন অ্যাডমিন থাকতে হবে';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_last_admin()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_roles_protect_last_admin ON public.user_roles;
CREATE TRIGGER user_roles_protect_last_admin
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_last_admin();

NOTIFY pgrst, 'reload schema';
COMMIT;

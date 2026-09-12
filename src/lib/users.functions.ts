import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AuthCtx = { supabase: any; userId: string };

async function assertAdmin(context: AuthCtx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) {
    const { data: row, error: rowError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (rowError) throw new Error(error.message);
    if (!row) throw new Error("Forbidden: শুধু অ্যাডমিন এই কাজ করতে পারেন");
    return;
  }
  if (!data) throw new Error("Forbidden: শুধু অ্যাডমিন এই কাজ করতে পারেন");
}

export type ManagedUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  role: "admin" | "editor" | "none";
};

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUser[]> => {
    await assertAdmin(context as AuthCtx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw new Error(error.message);

    const [{ data: roles }, { data: profiles }] = await Promise.all([
      context.supabase.from("user_roles").select("user_id, role"),
      context.supabase.from("profiles").select("id, display_name"),
    ]);

    const roleBy = new Map((roles ?? []).map((r) => [r.user_id, r.role as "admin" | "editor"]));
    const nameBy = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

    return list.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      display_name: nameBy.get(u.id) ?? null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at),
      role: roleBy.get(u.id) ?? "none",
    }));
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["admin", "editor", "none"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as AuthCtx);

    if (data.userId === context.userId && data.role !== "admin") {
      throw new Error("নিজের অ্যাডমিন ভূমিকা নিজে সরানো যাবে না");
    }

    const { error: delError } = await context.supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (delError) throw new Error(delError.message);

    if (data.role !== "none") {
      const { error } = await context.supabase
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const inviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        email: z.string().email("সঠিক ইমেইল দিন"),
        role: z.enum(["admin", "editor", "none"]),
        displayName: z.string().optional().default(""),
        redirectTo: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as AuthCtx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      ...(data.redirectTo ? { redirectTo: data.redirectTo } : {}),
      data: { display_name: data.displayName || data.email.split("@")[0] },
    });
    if (error) throw new Error(error.message);

    const newUserId = invited?.user?.id;
    if (newUserId && data.role !== "none") {
      await context.supabase.from("user_roles").delete().eq("user_id", newUserId);
      const { error: roleError } = await context.supabase
        .from("user_roles")
        .insert({ user_id: newUserId, role: data.role });
      if (roleError) throw new Error(roleError.message);
    }
    return { ok: true, id: newUserId ?? null };
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        email: z.string().email("সঠিক ইমেইল দিন"),
        password: z.string().min(6, "পাসওয়ার্ড কমপক্ষে ৬ অক্ষর হতে হবে"),
        role: z.enum(["admin", "editor", "none"]),
        displayName: z.string().optional().default(""),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as AuthCtx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const displayName = data.displayName || data.email.split("@")[0];
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (error) throw new Error(error.message);

    const newUserId = created.user?.id;
    if (!newUserId) throw new Error("ব্যবহারকারী তৈরি হয়নি");

    await context.supabase.from("profiles").upsert({
      id: newUserId,
      display_name: displayName,
    });

    if (data.role !== "none") {
      await context.supabase.from("user_roles").delete().eq("user_id", newUserId);
      const { error: roleError } = await context.supabase
        .from("user_roles")
        .insert({ user_id: newUserId, role: data.role });
      if (roleError) throw new Error(roleError.message);
    }

    return { ok: true, id: newUserId };
  });

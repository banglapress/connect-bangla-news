function first(...values: Array<string | undefined>): string | undefined {
  return values.find((v) => typeof v === "string" && v.trim().length > 0)?.trim();
}

function env(name: string): string | undefined {
  const vite = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return first(vite?.[name], typeof process !== "undefined" ? process.env?.[name] : undefined);
}

export function getSupabaseUrl(): string | undefined {
  return first(
    env("SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("VITE_SUPABASE_URL"),
  );
}

export function getSupabasePublishableKey(): string | undefined {
  return first(
    env("SUPABASE_PUBLISHABLE_KEY"),
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    env("VITE_SUPABASE_PUBLISHABLE_KEY"),
    env("SUPABASE_ANON_KEY"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    env("VITE_SUPABASE_ANON_KEY"),
  );
}

export function getSupabaseSecretKey(): string | undefined {
  return first(env("SUPABASE_SECRET_KEY"), env("SUPABASE_SERVICE_ROLE_KEY"));
}

import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "সম্পাদকীয় প্রবেশ — The Connect" },
      {
        name: "description",
        content: "The Connect-এর সম্পাদকীয় প্যানেলে অনুমোদিত অ্যাকাউন্ট দিয়ে প্রবেশ করুন।",
      },
      { property: "og:title", content: "সম্পাদকীয় প্রবেশ — The Connect" },
      { property: "og:description", content: "সম্পাদকীয় প্যানেলে অনুমোদিত অ্যাকাউন্ট দিয়ে প্রবেশ করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) {
        void navigate({ to: "/admin", replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "প্রবেশ করা যায়নি, আবার চেষ্টা করুন");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/admin",
      },
    });

    if (error) {
      toast.error("গুগল দিয়ে প্রবেশ করা যায়নি");
      return;
    }

    if (data?.url) window.location.assign(data.url);
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-14">
      <h1 className="font-serif text-3xl font-bold">সম্পাদকীয় প্রবেশ</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        সম্পাদকীয় দলের অনুমোদিত অ্যাকাউন্ট দিয়ে প্রবেশ করুন।
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 border border-border bg-card p-5">
        <div>
          <label className="mb-1 block text-sm font-medium">ইমেইল</label>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">পাসওয়ার্ড</label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            placeholder="••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary py-2 font-medium text-primary-foreground disabled:opacity-60"
        >
          {loading ? "অপেক্ষা করুন…" : "প্রবেশ করুন"}
        </button>

        <button
          type="button"
          onClick={handleGoogle}
          className="w-full border border-border py-2 text-sm font-medium hover:bg-secondary"
        >
          গুগল দিয়ে প্রবেশ
        </button>
      </form>

      <Link to="/" className="mt-6 text-center text-sm text-primary hover:underline">
        প্রথম পাতায় ফিরুন
      </Link>
    </div>
  );
}

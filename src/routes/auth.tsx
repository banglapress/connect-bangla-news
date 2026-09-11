import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "সম্পাদকীয় প্রবেশ — The Connect" },
      {
        name: "description",
        content: "The Connect-এর সম্পাদকীয় প্যানেলে প্রবেশ করুন খবর লিখতে ও প্রকাশ করতে।",
      },
      { property: "og:title", content: "সম্পাদকীয় প্রবেশ — The Connect" },
      { property: "og:description", content: "সম্পাদকীয় প্যানেলে প্রবেশ করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/admin", replace: true });
    });
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/admin`,
            data: { display_name: name || email.split("@")[0] },
          },
        });
        if (error) throw error;
        if (!data.session) {
          toast.success("অ্যাকাউন্ট তৈরি হয়েছে। ইমেইলে পাঠানো লিংকে ক্লিক করে নিশ্চিত করুন।");
          return;
        }
        navigate({ to: "/admin" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/admin" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "সমস্যা হয়েছে, আবার চেষ্টা করুন");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("গুগল দিয়ে প্রবেশ করা যায়নি");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/admin" });
  }

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-14">
      <h1 className="font-serif text-3xl font-bold">সম্পাদকীয় প্রবেশ</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        খবর লিখতে ও প্রকাশ করতে অ্যাকাউন্টে প্রবেশ করুন।
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 border border-border bg-card p-5">
        {mode === "signup" && (
          <div>
            <label className="mb-1 block text-sm font-medium">আপনার নাম</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-border bg-background px-3 py-2 outline-none focus:border-primary"
              placeholder="নাম"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">ইমেইল</label>
          <input
            type="email"
            required
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
            minLength={6}
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
          {loading ? "অপেক্ষা করুন…" : mode === "signin" ? "প্রবেশ করুন" : "অ্যাকাউন্ট খুলুন"}
        </button>

        <button
          type="button"
          onClick={handleGoogle}
          className="w-full border border-border py-2 text-sm font-medium hover:bg-secondary"
        >
          গুগল দিয়ে প্রবেশ
        </button>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "signin" ? "অ্যাকাউন্ট নেই?" : "আগেই অ্যাকাউন্ট আছে?"}{" "}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "নতুন অ্যাকাউন্ট" : "প্রবেশ করুন"}
          </button>
        </p>
      </form>

      <Link to="/" className="mt-6 text-center text-sm text-primary hover:underline">
        প্রথম পাতায় ফিরুন
      </Link>
    </div>
  );
}

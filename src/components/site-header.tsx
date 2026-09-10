import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, Search, X } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import { formatBanglaFullDate } from "@/lib/bangla";
import { useHydrated } from "@tanstack/react-router";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const hydrated = useHydrated();

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    navigate({ to: "/search", search: { q } });
  }

  return (
    <header className="border-b-2 border-foreground bg-background">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-between border-b border-border py-2 text-xs text-muted-foreground">
          <span>{hydrated ? formatBanglaFullDate(new Date()) : ""}</span>
          <Link to="/auth" className="hover:text-primary">
            সম্পাদকীয় প্রবেশ
          </Link>
        </div>

        <div className="flex items-center justify-between gap-3 py-5">
          <button
            type="button"
            aria-label="মেনু"
            className="md:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>

          <Link to="/" className="mx-auto text-center md:mx-0">
            <span className="block font-serif text-4xl font-bold leading-none tracking-tight md:text-5xl">
              The Connect
            </span>
            <span className="mt-1 block text-[0.7rem] uppercase tracking-[0.35em] text-primary">
              সংবাদ ও মতামত
            </span>
          </Link>

          <form onSubmit={submitSearch} className="hidden items-center gap-2 md:flex">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="খবর খুঁজুন"
              className="w-44 border border-border bg-card px-3 py-1.5 text-sm outline-none focus:border-primary"
            />
            <button type="submit" aria-label="খুঁজুন" className="text-foreground hover:text-primary">
              <Search className="size-5" />
            </button>
          </form>

          <span className="w-6 md:hidden" />
        </div>
      </div>

      <nav className="border-t border-border bg-secondary">
        <div className="mx-auto hidden max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2 text-sm font-medium md:flex">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              to="/category/$slug"
              params={{ slug: c.slug }}
              activeProps={{ className: "text-primary" }}
              className="hover:text-primary"
            >
              {c.name}
            </Link>
          ))}
        </div>

        {open && (
          <div className="md:hidden">
            <form onSubmit={submitSearch} className="flex gap-2 border-b border-border p-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="খবর খুঁজুন"
                className="flex-1 border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button type="submit" className="bg-primary px-3 text-sm text-primary-foreground">
                খুঁজুন
              </button>
            </form>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-4 text-sm">
              {CATEGORIES.map((c) => (
                <Link
                  key={c.slug}
                  to="/category/$slug"
                  params={{ slug: c.slug }}
                  onClick={() => setOpen(false)}
                  className="border-b border-border pb-1 hover:text-primary"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}

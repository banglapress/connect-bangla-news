import { createFileRoute, Link } from "@tanstack/react-router";
import { Image, LayoutTemplate, Palette } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/facebook-cards")({
  head: () => ({
    meta: [
      { title: "Facebook Photo Cards — The Connect" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: FacebookCardsPage,
});

const templates = [
  { number: 1, name: "Editorial Photo", description: "বড় ছবি + শক্তিশালী headline + category label" },
  { number: 2, name: "Breaking", description: "Breaking / urgent story-এর জন্য high-contrast layout" },
  { number: 3, name: "Explainer", description: "Explainer story-এর জন্য headline-led visual" },
  { number: 4, name: "Feature", description: "Feature / long-form story-এর জন্য magazine-style card" },
  { number: 5, name: "Minimal", description: "পরিষ্কার, কম উপাদানের premium editorial look" },
];

function FacebookCardsPage() {
  return (
    <div className="min-h-[70vh] bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Image className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">The Connect</p>
                  <h1 className="font-serif text-2xl font-bold">Facebook Photo Cards</h1>
                </div>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                এখানে Facebook-এর ৪:৫ photo card-এর template নির্বাচন, preview ও generation workflow রাখা হবে।
                Card generation engine পরের ধাপে যুক্ত হবে।
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/desk" className="rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-secondary">
                AI Newsroom
              </Link>
              <Link to="/admin" className="rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-secondary">
                সম্পাদকীয় প্যানেল
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => (
              <section key={template.number} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2 text-sm font-semibold">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs">
                      {String(template.number).padStart(2, "0")}
                    </span>
                    {template.name}
                  </div>
                  <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
                </div>

                <div className="mt-4 flex aspect-[4/5] items-center justify-center rounded-lg border border-dashed border-border bg-secondary/30">
                  <div className="text-center">
                    <Palette className="mx-auto h-7 w-7 text-muted-foreground" />
                    <p className="mt-2 text-xs font-medium text-muted-foreground">Template preview</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Design engine coming next</p>
                  </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-muted-foreground">{template.description}</p>
                <button type="button" disabled className="mt-4 w-full rounded-lg border border-border px-3 py-2 text-xs font-medium opacity-50">
                  এই template ব্যবহার করুন
                </button>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

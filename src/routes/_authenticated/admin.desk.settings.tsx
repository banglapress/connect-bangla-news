import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getMyAccess } from "@/lib/admin.functions";
import { getDeskSettings, saveDeskSettings } from "@/lib/desk/settings.functions";
import { getCardTemplateSettings, getFacebookConnection, saveCardTemplateSettings } from "@/lib/desk/social.functions";
import { DEFAULT_CARD_TEMPLATE } from "@/lib/desk/card/template";

export const Route = createFileRoute("/_authenticated/admin/desk/settings")({
  head: () => ({ meta: [{ title: "ডেস্ক সেটিংস — The Connect" }, { name: "robots", content: "noindex" }] }),
  component: DeskSettingsPage,
});

function DeskSettingsPage() {
  const queryClient = useQueryClient();
  const fetchAccess = useServerFn(getMyAccess);
  const fetchSettings = useServerFn(getDeskSettings);
  const save = useServerFn(saveDeskSettings);
  const fetchCard = useServerFn(getCardTemplateSettings);
  const saveCard = useServerFn(saveCardTemplateSettings);
  const fetchFacebook = useServerFn(getFacebookConnection);
  const access = useQuery({ queryKey: ["access"], queryFn: () => fetchAccess() });
  const settings = useQuery({ queryKey: ["desk-settings"], queryFn: () => fetchSettings(), enabled: access.data?.isStaff === true });
  const card = useQuery({ queryKey: ["desk-card-template"], queryFn: () => fetchCard(), enabled: access.data?.isStaff === true });
  const facebook = useQuery({ queryKey: ["desk-facebook"], queryFn: () => fetchFacebook(), enabled: access.data?.isStaff === true });
  const [lookbackHours, setLookbackHours] = useState(12);
  const [maxItems, setMaxItems] = useState(20);
  const [brand, setBrand] = useState(DEFAULT_CARD_TEMPLATE.brand);
  const [ratio, setRatio] = useState<"1:1" | "4:5">(DEFAULT_CARD_TEMPLATE.ratio);
  const [accent, setAccent] = useState(DEFAULT_CARD_TEMPLATE.accent);
  const [background, setBackground] = useState(DEFAULT_CARD_TEMPLATE.background);
  const [text, setText] = useState(DEFAULT_CARD_TEMPLATE.text);
  const [logoUrl, setLogoUrl] = useState(DEFAULT_CARD_TEMPLATE.logoUrl);

  useEffect(() => {
    if (settings.data) {
      setLookbackHours(settings.data.lookbackHours);
      setMaxItems(settings.data.maxItems);
    }
  }, [settings.data]);

  useEffect(() => {
    if (card.data) {
      setBrand(card.data.brand);
      setRatio(card.data.ratio);
      setAccent(card.data.accent);
      setBackground(card.data.background);
      setText(card.data.text);
      setLogoUrl(card.data.logoUrl);
    }
  }, [card.data]);

  if (!access.data?.isStaff) {
    return <p className="mx-auto max-w-xl px-4 py-16 text-center">শুধু সম্পাদকীয় দলের জন্য।</p>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="section-rule mb-6 flex items-center justify-between pb-2">
        <h1 className="font-serif text-2xl font-bold">ইনজেস্ট সেটিংস</h1>
        <a href="/admin/desk" className="text-sm text-primary hover:underline">স্টোরি মনিটর</a>
      </div>
      <form
        className="grid gap-4 border border-border p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await save({ data: { lookbackHours, maxItems } });
            toast.success("সেটিংস সংরক্ষিত");
            await queryClient.invalidateQueries({ queryKey: ["desk-settings"] });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "সংরক্ষণ যায়নি");
          }
        }}
      >
        <label className="text-sm">
          প্রথম Run-এ কত ঘণ্টার আইটেম নেবা
          <select className="mt-1 block w-full border border-border px-3 py-2" value={lookbackHours} onChange={(e) => setLookbackHours(Number(e.target.value))}>
            <option value={6}>৬ ঘণ্টা</option>
            <option value={12}>১২ ঘণ্টা</option>
            <option value={24}>২৪ ঘণ্টা</option>
          </select>
        </label>
        <label className="text-sm">
          প্রতি সোর্সে সর্বোচ্চ নতুন আইটেম (৫–50)
          <input type="number" min={5} max={50} className="mt-1 block w-full border border-border px-3 py-2" value={maxItems} onChange={(e) => setMaxItems(Number(e.target.value))} />
        </label>
        <p className="text-xs text-muted-foreground">
          পরের Run-এ last successful fetch-এর পরের আইটেম নেয়া হবে না। বর্তমান স্টোরি মুছে যাবে না।
        </p>
        <button className="bg-primary px-4 py-2 text-sm text-primary-foreground">সংরক্ষণ</button>
      </form>

      <h2 className="section-rule mt-10 pb-1 font-serif text-xl font-bold">Photo Card template</h2>
      <form
        className="mt-4 grid gap-3 border border-border p-4 text-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await saveCard({ data: { brand, ratio, accent, background, text, logoUrl } });
            toast.success("Card template saved");
            await queryClient.invalidateQueries({ queryKey: ["desk-card-template"] });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not save template");
          }
        }}
      >
        <label>Brand name<input className="mt-1 w-full border border-border px-3 py-2" value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
        <label>Logo URL<input className="mt-1 w-full border border-border px-3 py-2" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} /></label>
        <label>
          Default ratio
          <select className="mt-1 w-full border border-border px-3 py-2" value={ratio} onChange={(e) => setRatio(e.target.value as "1:1" | "4:5")}>
            <option value="4:5">4:5</option>
            <option value="1:1">1:1</option>
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label>Accent<input className="mt-1 w-full border border-border px-3 py-2" value={accent} onChange={(e) => setAccent(e.target.value)} /></label>
          <label>Background<input className="mt-1 w-full border border-border px-3 py-2" value={background} onChange={(e) => setBackground(e.target.value)} /></label>
          <label>Text<input className="mt-1 w-full border border-border px-3 py-2" value={text} onChange={(e) => setText(e.target.value)} /></label>
        </div>
        <button className="bg-primary px-4 py-2 text-primary-foreground">Save card template</button>
      </form>

      <h2 className="section-rule mt-10 pb-1 font-serif text-xl font-bold">Facebook Page</h2>
      <div className="mt-4 space-y-2 border border-border p-4 text-sm">
        <p>Status: {facebook.data?.status || "loading"}</p>
        <p>Page: {facebook.data?.pageName || "not connected"}</p>
        <p>Page ID: {facebook.data?.pageIdMasked || "—"}</p>
        {facebook.data?.error ? <p className="text-destructive">{facebook.data.error}</p> : null}
        <p className="pt-2 text-xs text-muted-foreground">Tokens stay in server environment variables. They are never shown here or written to logs.</p>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Create a Meta app and add the Pages API.</li>
          <li>Generate a Page access token with pages_manage_posts, pages_read_engagement, pages_show_list.</li>
          <li>Set META_PAGE_ID and META_ACCESS_TOKEN on the host. Optional: META_PAGE_NAME, SITE_URL.</li>
          <li>Reload this page. Status should become ready.</li>
        </ol>
        <button type="button" className="mt-2 border border-border px-3 py-2" onClick={() => queryClient.invalidateQueries({ queryKey: ["desk-facebook"] })}>Recheck connection</button>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getMyAccess } from "@/lib/admin.functions";
import { getDeskSettings, saveDeskSettings } from "@/lib/desk/settings.functions";

export const Route = createFileRoute("/_authenticated/admin/desk/settings")({
  head: () => ({ meta: [{ title: "ডেস্ক সেটিংস — The Connect" }, { name: "robots", content: "noindex" }] }),
  component: DeskSettingsPage,
});

function DeskSettingsPage() {
  const queryClient = useQueryClient();
  const fetchAccess = useServerFn(getMyAccess);
  const fetchSettings = useServerFn(getDeskSettings);
  const save = useServerFn(saveDeskSettings);
  const access = useQuery({ queryKey: ["access"], queryFn: () => fetchAccess() });
  const settings = useQuery({ queryKey: ["desk-settings"], queryFn: () => fetchSettings(), enabled: access.data?.isStaff === true });
  const [lookbackHours, setLookbackHours] = useState(12);
  const [maxItems, setMaxItems] = useState(20);

  useEffect(() => {
    if (settings.data) {
      setLookbackHours(settings.data.lookbackHours);
      setMaxItems(settings.data.maxItems);
    }
  }, [settings.data]);

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
            <option value={6}>০ ঘণ্টা</option>
            <option value={12}>১২ ঘণ্টা</option>
            <option value={24}>২৪ ঘণ্টা</option>
          </select>
        </label>
        <label className="text-sm">
          প্রতি সোর্সে সর্বোচ্চ নতুন আইটেম (৫–50)
          <input type="number" min={5} max={50} className="mt-1 block w-full border border-border px-3 py-2" value={maxItems} onChange={(e) => setMaxItems(Number(e.target.value))} />
        </label>
        <p className="text-xs text-muted-foreground">
          পরের Run-এ last successful fetch-এর পরের আইটেম নেয়া হবে না। বর্তমান ৥৩টি স্টোরি মুছে যাবে না।
        </p>
        <button className="bg-primary px-4 py-2 text-sm text-primary-foreground">সংরক্ষণ</button>
      </form>
    </div>
  );
}

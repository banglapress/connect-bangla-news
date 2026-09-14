import { Outlet, createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/desk")({
  head: () => ({ meta: [{ title: "এআই ডেস্ক — The Connect" }, { name: "robots", content: "noindex" }] }),
  component: DeskLayout,
});

function DeskLayout() {
  const fetchAccess = useServerFn(getMyAccess);
  const access = useQuery({ queryKey: ["access"], queryFn: () => fetchAccess() });

  if (access.isLoading) return <p className="mx-auto max-w-5xl px-4 py-16 text-muted-foreground">অপেক্ষা করুন…</p>;
  if (!access.data?.isStaff) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold">এআই ডেস্ক শুধু সম্পাদকীয় দলের জন্য</h1>
        <Link to="/admin" className="mt-6 inline-block text-primary hover:underline">প্যানেলে ফিরুন</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="section-rule mb-6 flex flex-wrap items-center justify-between gap-3 pb-2">
        <h1 className="font-serif text-2xl font-bold">এআই সম্পাদকীয় ডেস্ক</h1>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link to="/admin/desk" className="border border-border px-3 py-1 hover:bg-secondary">স্টোরি মনিটর</Link>
          <Link to="/admin/desk/sources" className="border border-border px-3 py-1 hover:bg-secondary">সোর্স ম্যানেজার</Link>
          <Link to="/admin" className="text-primary hover:underline">মুখ্য প্যানেল</Link>
        </div>
      </div>
      <Outlet />
    </div>
  );
}

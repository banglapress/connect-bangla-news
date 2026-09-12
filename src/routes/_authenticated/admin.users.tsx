import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getMyAccess } from "@/lib/admin.functions";
import { createUser, inviteUser, listUsers, setUserRole } from "@/lib/users.functions";
import { formatBanglaDate } from "@/lib/bangla";
import { ROLE_OPTIONS } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "ব্যবহারকারী — The Connect" }, { name: "robots", content: "noindex" }] }),
  component: UsersPage,
});

type RoleValue = (typeof ROLE_OPTIONS)[number]["value"];

function UsersPage() {
  const queryClient = useQueryClient();
  const fetchAccess = useServerFn(getMyAccess);
  const fetchUsers = useServerFn(listUsers);
  const changeRole = useServerFn(setUserRole);
  const invite = useServerFn(inviteUser);
  const addUser = useServerFn(createUser);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleValue>("reporter");
  const [mode, setMode] = useState<"create" | "invite">("create");
  const [sending, setSending] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const access = useQuery({ queryKey: ["access"], queryFn: () => fetchAccess() });
  const isAdmin = access.data?.roles.includes("admin") === true;
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchUsers(), enabled: isAdmin });

  async function handleRole(userId: string, role: RoleValue) {
    setSavingId(userId);
    try {
      await changeRole({ data: { userId, role } });
      toast.success("ভূমিকা বদলানো হয়েছে");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "ভূমিকা বদলানো যায়নি");
    } finally {
      setSavingId(null);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      if (mode === "create") {
        await addUser({ data: { email, password, role: inviteRole, displayName: name } });
        toast.success("ব্যবহারকারী যোগ হয়েছে");
      } else {
        await invite({ data: { email, role: inviteRole, displayName: name, redirectTo: `${window.location.origin}/admin` } });
        toast.success("আমন্ত্রণ পাঠানো হয়েছে");
      }
      setEmail(""); setName(""); setPassword("");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "যোগ করা যায়নি");
    } finally {
      setSending(false);
    }
  }

  if (!access.data) return <p className="mx-auto max-w-5xl px-4 py-16">অপেক্ষা করুন…</p>;
  if (!isAdmin) return <div className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="font-serif text-2xl font-bold">শুধু অ্যাডমিনের জন্য</h1><Link to="/admin" className="mt-6 inline-block text-primary">প্যানেলে ফিরুন</Link></div>;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="section-rule mb-6 flex items-center justify-between pb-2">
        <h1 className="font-serif text-2xl font-bold">ব্যবহারকারী</h1>
        <Link to="/admin" className="border border-border px-4 py-2 text-sm">প্যানেলে ফিরুন</Link>
      </div>
      <form onSubmit={handleAdd} className="mb-8 grid gap-3 border border-border p-4 sm:grid-cols-2">
        <div className="sm:col-span-2 flex gap-2 text-sm">
          <button type="button" onClick={() => setMode("create")} className={`border px-3 py-1 ${mode === "create" ? "border-primary text-primary" : "border-border"}`}>সরাসরি যোগ</button>
          <button type="button" onClick={() => setMode("invite")} className={`border px-3 py-1 ${mode === "invite" ? "border-primary text-primary" : "border-border"}`}>ইমেইল আমন্ত্রণ</button>
        </div>
        <input required type="email" className="border border-border px-3 py-2" placeholder="ইমেইল" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="border border-border px-3 py-2" placeholder="নাম" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="border border-border px-3 py-2" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as RoleValue)}>
          {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        {mode === "create" ? <input required type="password" minLength={6} className="border border-border px-3 py-2" placeholder="পাসওয়ার্ড" value={password} onChange={(e) => setPassword(e.target.value)} /> : <span />}
        <button disabled={sending} className="bg-primary px-4 py-2 text-sm text-primary-foreground sm:col-span-2">{sending ? "অপেক্ষা করুন…" : mode === "create" ? "ইযুজার যোগ করুন" : "আমন্ত্রণ পাঠান"}</button>
      </form>
      <div className="divide-y divide-border border border-border">
        {(users.data ?? []).map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{u.display_name || u.email}</p>
              <p className="text-xs text-muted-foreground">{u.email} · {formatBanglaDate(u.created_at)}</p>
            </div>
            <select value={u.role} disabled={savingId === u.id} onChange={(e) => void handleRole(u.id, e.target.value as RoleValue)} className="border border-border px-2 py-1 text-sm">
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              {u.role === "editor" ? <option value="editor">পুরনো সম্পাদক</option> : null}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

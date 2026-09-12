import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { getMyAccess } from "@/lib/admin.functions";
import { createUser, inviteUser, listUsers, setUserRole } from "@/lib/users.functions";
import { formatBanglaDate } from "@/lib/bangla";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [{ title: "ব্যবহারকারী — The Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: UsersPage,
});

const ROLE_LABEL: Record<string, string> = {
  admin: "অ্যাডমিন",
  editor: "সম্পাদক",
  none: "সাধারণ",
};

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
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "none">("editor");
  const [mode, setMode] = useState<"create" | "invite">("create");
  const [sending, setSending] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const access = useQuery({ queryKey: ["access"], queryFn: () => fetchAccess() });
  const isAdmin = access.data?.roles.includes("admin") === true;

  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
    enabled: isAdmin,
  });

  async function handleRole(userId: string, role: "admin" | "editor" | "none") {
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
        await addUser({
          data: {
            email,
            password,
            role: inviteRole,
            displayName: name,
          },
        });
        toast.success("ব্যবহারকারী যোগ হয়েছে");
      } else {
        await invite({
          data: {
            email,
            role: inviteRole,
            displayName: name,
            redirectTo: `${window.location.origin}/admin`,
          },
        });
        toast.success("আমন্ত্রণ পাঠানো হয়েছে");
      }
      setEmail("");
      setName("");
      setPassword("");
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "যোগ করা যায়নি");
    } finally {
      setSending(false);
    }
  }

  if (access.isLoading) {
    return <p className="mx-auto max-w-5xl px-4 py-16 text-muted-foreground">অপেক্ষা করুন…</p>;
  }

  if (access.isError) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold">অনুমতি যাচাই করা যায়নি</h1>
        <p className="mt-3 break-words text-sm text-muted-foreground">
          {access.error instanceof Error ? access.error.message : "অজানা ত্রুটি"}
        </p>
        <button
          onClick={() => void access.refetch()}
          className="mt-6 bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          আবার চেষ্টা করুন
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-serif text-2xl font-bold">শুধু অ্যাডমিনের জন্য</h1>
        <p className="mt-3 text-muted-foreground">
          ব্যবহারকারী ব্যবস্থাপনা শুধু অ্যাডমিন ভূমিকার জন্য।
        </p>
        <Link to="/admin" className="mt-6 inline-block text-primary hover:underline">
          প্যানেলে ফিরুন
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="section-rule flex flex-wrap items-center justify-between gap-3 pb-2">
        <h1 className="font-serif text-2xl font-bold">ব্যবহারকারী</h1>
        <Link to="/admin" className="border border-border px-4 py-2 text-sm hover:bg-secondary">
          প্যানেলে ফিরুন
        </Link>
      </div>

      <form
        onSubmit={handleAdd}
        className="mt-6 grid gap-3 border border-border bg-card p-4 sm:grid-cols-4"
      >
        <div className="sm:col-span-4 flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`border px-3 py-1 ${mode === "create" ? "border-primary text-primary" : "border-border"}`}
          >
            সরাসরি যোগ
          </button>
          <button
            type="button"
            onClick={() => setMode("invite")}
            className={`border px-3 py-1 ${mode === "invite" ? "border-primary text-primary" : "border-border"}`}
          >
            ইমেইল আমন্ত্রণ
          </button>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">ইমেইল</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="new@example.com"
            className="w-full border border-border bg-background px-3 py-2 outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">নাম</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="নাম"
            className="w-full border border-border bg-background px-3 py-2 outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">ভূমিকা</label>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as "admin" | "editor" | "none")}
            className="w-full border border-border bg-background px-3 py-2 outline-none focus:border-primary"
          >
            <option value="editor">সম্পাদক</option>
            <option value="admin">অ্যাডমিন</option>
            <option value="none">সাধারণ</option>
          </select>
        </div>
        {mode === "create" && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">পাসওয়ার্ড</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="কমপক্ষে ৬ অক্ষর"
              className="w-full border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
          </div>
        )}
        <div className="sm:col-span-4">
          <button
            type="submit"
            disabled={sending}
            className="bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60"
          >
            {sending ? "অপেক্ষা করুন…" : mode === "create" ? "ইযুজার যোগ করুন" : "আমন্ত্রণ পাঠান"}
          </button>
          <span className="ml-3 text-xs text-muted-foreground">
            {mode === "create"
              ? "ইমেইল ও পাসওয়ার্ড দিয়ে সাথে সাথে যোগ হবে; তারা /auth থেকে প্রবেশ করতে পারবে।"
              : "ইমেইলে লিংক যাবে; পাসওয়ার্ড ঠিক করে প্রবেশ করতে পারবেন।"}
          </span>
        </div>
      </form>

      {users.isLoading ? (
        <p className="py-10 text-muted-foreground">তালিকা আনা হচ্ছে…</p>
      ) : users.isError ? (
        <div className="py-10">
          <p className="text-destructive">
            {users.error instanceof Error ? users.error.message : "তালিকা আনা যায়নি"}
          </p>
          <button
            onClick={() => void users.refetch()}
            className="mt-3 border border-border px-3 py-1 text-sm"
          >
            আবার চেষ্টা করুন
          </button>
        </div>
      ) : (
        <div className="mt-6 divide-y divide-border border border-border">
          {(users.data ?? []).map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{u.display_name || u.email}</p>
                <p className="text-xs text-muted-foreground">
                  {u.email} · যোগ {formatBanglaDate(u.created_at)} ·{" "}
                  {u.confirmed ? "নিশ্চিত" : "অপেক্ষমাণ"} · {ROLE_LABEL[u.role]}
                </p>
              </div>
              <select
                value={u.role}
                disabled={savingId === u.id}
                onChange={(e) => void handleRole(u.id, e.target.value as "admin" | "editor" | "none")}
                className="border border-border bg-background px-2 py-1 text-sm"
              >
                <option value="admin">অ্যাডমিন</option>
                <option value="editor">সম্পাদক</option>
                <option value="none">সাধারণ</option>
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

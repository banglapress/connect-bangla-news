import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Settings2,
  Sparkles,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { getMyAccess } from "@/lib/admin.functions";
import { createEditorialStory } from "@/lib/desk/editorial.functions";
import { listDeskStories } from "@/lib/desk/stories.functions";
import { listDeskJobs, runDeskIngest } from "@/lib/desk/ingest.functions";
import { runDeskAutoDraft } from "@/lib/desk/auto-draft.functions";
import { listNewsSources, saveNewsSource, setNewsSourceActive } from "@/lib/desk/sources.functions";
import { listCategories } from "@/lib/category.functions";
import { formatBanglaDateTime } from "@/lib/bangla";

type View = "overview" | "sources" | "queue";
type StoryStatus = "all" | "new" | "researching" | "draft" | "review" | "approved" | "rejected";

const STATUS_META: Record<string, { label: string; tone: string }> = {
  new: { label: "নতুন", tone: "border-slate-300 bg-slate-50 text-slate-700" },
  researching: { label: "রিসার্চ চলছে", tone: "border-blue-200 bg-blue-50 text-blue-700" },
  draft: { label: "ড্রাফট", tone: "border-amber-200 bg-amber-50 text-amber-700" },
  review: { label: "এডিটর রিভিউ", tone: "border-violet-200 bg-violet-50 text-violet-700" },
  approved: { label: "অনুমোদিত", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  published: { label: "প্রকাশিত", tone: "border-green-200 bg-green-50 text-green-700" },
  rejected: { label: "বাতিল", tone: "border-red-200 bg-red-50 text-red-700" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: "border-border bg-secondary text-muted-foreground" };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.tone}`}>{meta.label}</span>;
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

export function AiNewsroom() {
  const queryClient = useQueryClient();
  const accessFn = useServerFn(getMyAccess);
  const storiesFn = useServerFn(listDeskStories);
  const jobsFn = useServerFn(listDeskJobs);
  const sourcesFn = useServerFn(listNewsSources);
  const categoriesFn = useServerFn(listCategories);
  const ingestFn = useServerFn(runDeskIngest);
  const autoDraftFn = useServerFn(runDeskAutoDraft);
  const createStoryFn = useServerFn(createEditorialStory);
  const saveSourceFn = useServerFn(saveNewsSource);
  const toggleSourceFn = useServerFn(setNewsSourceActive);

  const access = useQuery({ queryKey: ["access"], queryFn: () => accessFn() });
  const stories = useQuery({
    queryKey: ["desk-stories"],
    queryFn: () => storiesFn(),
    enabled: access.data?.isStaff === true,
  });
  const jobs = useQuery({
    queryKey: ["desk-jobs"],
    queryFn: () => jobsFn(),
    enabled: access.data?.isStaff === true,
  });
  const sources = useQuery({
    queryKey: ["news-sources"],
    queryFn: () => sourcesFn(),
    enabled: access.data?.isStaff === true,
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoriesFn(),
    enabled: access.data?.isStaff === true,
  });

  const [view, setView] = useState<View>("overview");
  const [queueFilter, setQueueFilter] = useState<StoryStatus>("all");
  const [search, setSearch] = useState("");
  const [running, setRunning] = useState(false);
  const [runningSource, setRunningSource] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [topic, setTopic] = useState("");
  const [topicType, setTopicType] = useState<"news" | "explainer" | "feature">("explainer");
  const [topicCategory, setTopicCategory] = useState("national");
  const [creatingTopic, setCreatingTopic] = useState(false);

  const [sourceName, setSourceName] = useState("");
  const [sourceRss, setSourceRss] = useState("");
  const [sourceCategory, setSourceCategory] = useState("national");
  const [savingSource, setSavingSource] = useState(false);

  useEffect(() => {
    if (categories.data?.length && !categories.data.some((row) => row.slug === topicCategory)) {
      setTopicCategory(categories.data[0]!.slug);
    }
  }, [categories.data, topicCategory]);

  const storyRows = stories.data ?? [];
  const sourceRows = sources.data ?? [];

  const counts = useMemo(() => ({
    new: storyRows.filter((row) => row.status === "new").length,
    researching: storyRows.filter((row) => row.status === "researching").length,
    draft: storyRows.filter((row) => row.status === "draft").length,
    review: storyRows.filter((row) => row.status === "review").length,
    approved: storyRows.filter((row) => row.status === "approved").length,
  }), [storyRows]);

  const filteredStories = useMemo(() => {
    const term = search.trim().toLowerCase();
    return storyRows.filter((row) => {
      if (queueFilter !== "all" && row.status !== queueFilter) return false;
      if (!term) return true;
      return String(row.title_hint || "").toLowerCase().includes(term)
        || String(row.category_slug || "").toLowerCase().includes(term);
    });
  }, [storyRows, queueFilter, search]);

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["desk-stories"] }),
      queryClient.invalidateQueries({ queryKey: ["desk-jobs"] }),
      queryClient.invalidateQueries({ queryKey: ["news-sources"] }),
    ]);
  }

  async function runNewsroom() {
    setRunning(true);
    setMessage(null);
    try {
      const out = await autoDraftFn({ data: { limit: 4 } });
      const draft = out.summary?.draftCount ?? 0;
      const sourceNeeded = out.summary?.needsSources ?? 0;
      const errors = out.summary?.errors ?? 0;
      const fetched = (out.ingest?.results ?? []).reduce((total, row) => total + row.fetched, 0);
      const created = (out.ingest?.results ?? []).reduce((total, row) => total + row.inserted, 0);
      const summary = `Newsroom run শেষ · fetched ${fetched} · নতুন story ${created} · draft ${draft} · আরও source দরকার ${sourceNeeded} · error ${errors}`;
      setMessage(summary);
      if (errors) toast.warning(summary);
      else toast.success(summary);
      await refreshAll();
    } catch (error) {
      const msg = error instanceof Error ? error.message : "AI newsroom চালানো যায়নি";
      setMessage(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  }

  async function runSource(id: string, name: string) {
    setRunningSource(id);
    try {
      const out = await ingestFn({ data: { sourceId: id } });
      const row = out.results[0];
      const msg = `${name}: fetched ${row?.fetched ?? 0} · নতুন ${row?.inserted ?? 0} · duplicate ${row?.duplicates ?? 0}`;
      setMessage(msg);
      if (row?.error) toast.error(row.error);
      else toast.success(msg);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Source ingest ব্যর্থ");
    } finally {
      setRunningSource(null);
    }
  }

  async function createTopicProject() {
    if (topic.trim().length < 5) {
      toast.error("কমপক্ষে ৫ অক্ষরের topic দিন");
      return;
    }
    setCreatingTopic(true);
    try {
      const result = await createStoryFn({
        data: { title: topic.trim(), editorialType: topicType, categorySlug: topicCategory },
      });
      toast.success("Editorial project তৈরি হয়েছে");
      setTopic("");
      await refreshAll();
      window.location.href = `/admin/desk/${result.id}`;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Project তৈরি হয়নি");
    } finally {
      setCreatingTopic(false);
    }
  }

  async function createSource(event: React.FormEvent) {
    event.preventDefault();
    if (!sourceName.trim() || !sourceRss.trim()) {
      toast.error("Source name ও RSS URL দিন");
      return;
    }
    setSavingSource(true);
    try {
      await saveSourceFn({
        data: {
          name: sourceName.trim(),
          homepage_url: null,
          rss_url: sourceRss.trim(),
          api_url: null,
          category_slug: sourceCategory,
          active: true,
          trust_level: 4,
          priority: 50,
          notes: "Added from AI Newsroom",
          source_kind: "major_news",
        },
      });
      toast.success("RSS source যোগ হয়েছে");
      setSourceName("");
      setSourceRss("");
      await queryClient.invalidateQueries({ queryKey: ["news-sources"] });
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Source যোগ করা যায়নি");
    } finally {
      setSavingSource(false);
    }
  }

  async function toggleSource(id: string, active: boolean) {
    try {
      await toggleSourceFn({ data: { id, active: !active } });
      await queryClient.invalidateQueries({ queryKey: ["news-sources"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Source status বদলানো যায়নি");
    }
  }

  if (access.isLoading) {
    return <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-muted-foreground">AI Newsroom লোড হচ্ছে…</div>;
  }

  if (!access.data?.isStaff) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Bot className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 font-serif text-2xl font-bold">AI Newsroom শুধু সম্পাদকীয় দলের জন্য</h1>
        <a href="/admin" className="mt-6 inline-block text-sm text-primary hover:underline">প্যানেলে ফিরে যান</a>
      </div>
    );
  }

  const categoryOptions = categories.data ?? [];
  const recentJobs = jobs.data ?? [];

  return (
    <div className="min-h-[70vh] bg-muted/20">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="rounded-2xl border border-border bg-background p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="h-5 w-5" /></span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">The Connect</p>
                  <h1 className="font-serif text-2xl font-bold">AI Newsroom</h1>
                </div>
              </div>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                RSS → Story Cluster → Related Coverage → Research → AI Draft → Editor Review
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void runNewsroom()} disabled={running} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {running ? "Newsroom চলছে…" : "Run Newsroom Now"}
              </button>
              <button type="button" onClick={() => void refreshAll()} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="নতুন story" value={counts.new} icon={<Clock3 className="h-4 w-4" />} />
            <StatCard label="Researching" value={counts.researching} icon={<WandSparkles className="h-4 w-4" />} />
            <StatCard label="AI Draft" value={counts.draft} icon={<FileText className="h-4 w-4" />} />
            <StatCard label="Editor Review" value={counts.review} icon={<AlertTriangle className="h-4 w-4" />} />
            <StatCard label="Approved" value={counts.approved} icon={<CheckCircle2 className="h-4 w-4" />} />
          </div>

          {message ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
              <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="flex-1">{message}</p>
              <button type="button" onClick={() => setMessage(null)} aria-label="বন্ধ করুন"><XCircle className="h-4 w-4 text-muted-foreground" /></button>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-1 rounded-xl border border-border bg-secondary/40 p-1">
            {([
              ["overview", "Overview"],
              ["sources", "RSS Sources"],
              ["queue", "Story Queue"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={view === key ? "rounded-lg bg-background px-4 py-2 text-sm font-semibold shadow-sm" : "rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground"}
              >
                {label}
              </button>
            ))}
            <a href="/admin/facebook-cards" className="ml-auto inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              Facebook Photo Cards
            </a>
            <a href="/admin/desk/settings" className="inline-flex items-center gap-1 rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
              <Settings2 className="h-4 w-4" /> Settings
            </a>
          </div>

          {view === "overview" ? (
            <div className="mt-6 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
              <section className="rounded-xl border border-border bg-background">
                <div className="border-b border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-serif text-lg font-bold">Quick Start</h2>
                      <p className="mt-1 text-xs text-muted-foreground">একটি topic থেকে manual research project শুরু করুন।</p>
                    </div>
                    <WandSparkles className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="যেমন: বাংলাদেশে গ্যাস সংকট কেন বাড়ছে?" className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select value={topicType} onChange={(e) => setTopicType(e.target.value as typeof topicType)} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
                      <option value="news">News</option>
                      <option value="explainer">Explainer</option>
                      <option value="feature">Feature</option>
                    </select>
                    <select value={topicCategory} onChange={(e) => setTopicCategory(e.target.value)} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
                      {categoryOptions.map((cat) => <option key={cat.slug} value={cat.slug}>{cat.name}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={() => void createTopicProject()} disabled={creatingTopic} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                    <Plus className="h-4 w-4" /> {creatingTopic ? "তৈরি হচ্ছে…" : "Editorial Project শুরু করুন"}
                  </button>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-background">
                <div className="border-b border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="font-serif text-lg font-bold">Editor Inbox</h2>
                      <p className="mt-1 text-xs text-muted-foreground">AI যে খবরগুলো লিখে ফেলেছে, সেগুলোই আগে দেখুন।</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">{counts.draft + counts.review} ready</span>
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {storyRows.filter((story) => Boolean(story.article_id)).slice(0, 7).map((story) => (
                    <div key={story.id} className="p-3 hover:bg-secondary/40">
                      <div className="flex items-start gap-3">
                        <StatusBadge status={story.status} />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-medium">{story.draft_title || story.title_hint || "শিরোনামহীন story"}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{story.source_count} source · {formatBanglaDateTime(story.updated_at)}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <a href={`/admin/${story.article_id}/edit`} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-secondary">
                          <FileText className="h-3.5 w-3.5" /> Edit & Publish
                        </a>
                        <a href={`/admin/desk/${story.id}`} className="inline-flex items-center gap-1 px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-3.5 w-3.5" /> Story details
                        </a>
                      </div>
                    </div>
                  ))}
                  {!storyRows.some((story) => Boolean(story.article_id)) ? (
                    <div className="p-6 text-center">
                      <p className="text-sm font-medium">এখনো কোনো AI draft ready নেই</p>
                      <p className="mt-1 text-xs text-muted-foreground">Newsroom source ingest করার পর draft নিজে থেকেই এখানে আসবে।</p>
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          ) : null}

          {view === "sources" ? (
            <div className="mt-6 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
              <form onSubmit={createSource} className="rounded-xl border border-border bg-background p-4">
                <div className="flex items-center gap-2">
                  <Rss className="h-5 w-5 text-primary" />
                  <h2 className="font-serif text-lg font-bold">RSS Source যোগ করুন</h2>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Source যোগ হলে Run Newsroom-এর সময় এটি ingest হবে।</p>
                <div className="mt-4 space-y-3">
                  <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="যেমন: BBC Bangla" className="w-full rounded-lg border border-border px-3 py-2.5 text-sm" />
                  <input value={sourceRss} onChange={(e) => setSourceRss(e.target.value)} placeholder="https://example.com/rss.xml" className="w-full rounded-lg border border-border px-3 py-2.5 text-sm" />
                  <select value={sourceCategory} onChange={(e) => setSourceCategory(e.target.value)} className="w-full rounded-lg border border-border px-3 py-2.5 text-sm">
                    {categoryOptions.map((cat) => <option key={cat.slug} value={cat.slug}>{cat.name}</option>)}
                  </select>
                  <button type="submit" disabled={savingSource} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
                    <Plus className="h-4 w-4" /> {savingSource ? "সংরক্ষণ হচ্ছে…" : "Source যোগ করুন"}
                  </button>
                </div>
              </form>

              <section className="rounded-xl border border-border bg-background">
                <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                  <div>
                    <h2 className="font-serif text-lg font-bold">Sources & Health</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Active RSS sources এবং তাদের সর্বশেষ fetch status.</p>
                  </div>
                  <a href="/admin/desk/sources" className="text-xs font-medium text-primary hover:underline">Full source manager →</a>
                </div>
                <div className="divide-y divide-border">
                  {sourceRows.map((source) => (
                    <div key={source.id} className="p-4">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">{source.name}</p>
                            <span className={source.active ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700" : "rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground"}>
                              {source.active ? "ACTIVE" : "PAUSED"}
                            </span>
                            {source.access_status === "access_denied" ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">BLOCKED</span> : null}
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{source.rss_url || "Discovery / manual source"}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Last success: {source.last_success_at ? formatBanglaDateTime(source.last_success_at) : "এখনো হয়নি"}
                          </p>
                          {source.last_error ? <p className="mt-1 text-[11px] text-red-600">{source.last_error}</p> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => void runSource(source.id, source.name)} disabled={!source.active || !source.rss_url || runningSource === source.id} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs disabled:opacity-50">
                            <Rss className="h-3.5 w-3.5" /> {runningSource === source.id ? "চলছে…" : "Run"}
                          </button>
                          <button type="button" onClick={() => void toggleSource(source.id, source.active)} className="rounded-md border border-border px-2.5 py-1.5 text-xs">
                            {source.active ? "Pause" : "Activate"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!sourceRows.length ? <p className="p-4 text-sm text-muted-foreground">কোনো source নেই।</p> : null}
                </div>
              </section>
            </div>
          ) : null}

          {view === "queue" ? (
            <div className="mt-6">
              <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="font-serif text-lg font-bold">Story Queue</h2>
                  <p className="mt-1 text-xs text-muted-foreground">প্রতিটি story → research → AI article → editor review.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Story search" className="w-56 rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm" />
                  </div>
                  <select value={queueFilter} onChange={(e) => setQueueFilter(e.target.value as StoryStatus)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="all">সব status</option>
                    <option value="new">নতুন</option>
                    <option value="researching">Researching</option>
                    <option value="draft">Draft</option>
                    <option value="review">Review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {filteredStories.map((story) => (
                  <div key={story.id} className="rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/30">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={story.status} />
                          {story.editorial_type && story.editorial_type !== "news" ? (
                            <span className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[10px] font-semibold uppercase text-primary">{story.editorial_type}</span>
                          ) : null}
                          <span className="text-[11px] text-muted-foreground">{story.source_count} sources</span>
                          <span className="text-[11px] text-muted-foreground">· {formatBanglaDateTime(story.updated_at)}</span>
                        </div>
                        <a href={`/admin/desk/${story.id}`} className="mt-2 block text-base font-semibold leading-6 hover:text-primary">{story.title_hint || "শিরোনামহীন story"}</a>
                        {story.warning ? <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{story.warning}</p> : null}
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                          {story.article_id ? "AI article draft তৈরি হয়েছে।" : story.status === "new" ? "Sources ও research শুরু করার অপেক্ষায়।" : "Research workflow চলমান।"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <a href={`/admin/desk/${story.id}`} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-secondary">
                          <ExternalLink className="h-3.5 w-3.5" /> Open
                        </a>
                        {story.article_id ? (
                          <a href={`/admin/${story.article_id}/edit`} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-medium hover:bg-secondary">
                            <FileText className="h-3.5 w-3.5" /> Draft
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
                {!filteredStories.length ? (
                  <div className="rounded-xl border border-dashed border-border p-10 text-center">
                    <Search className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 text-sm text-muted-foreground">এই filter-এ কোনো story পাওয়া যায়নি।</p>
                  </div>
                ) : null}
              </div>

              <section className="mt-6 rounded-xl border border-border bg-background">
                <div className="border-b border-border p-4">
                  <h3 className="font-serif text-base font-bold">Recent Jobs</h3>
                </div>
                <div className="divide-y divide-border">
                  {recentJobs.map((job: any) => (
                    <div key={job.id} className="flex flex-wrap items-center gap-3 p-3 text-xs">
                      <span className={job.status === "failed" ? "text-red-600" : job.status === "running" ? "text-blue-600" : "text-emerald-600"}>{job.status}</span>
                      <span className="min-w-0 flex-1 truncate">{job.payload?.sourceName || job.stage}{job.error ? ` · ${job.error}` : ""}</span>
                      <span className="text-muted-foreground">{formatBanglaDateTime(job.created_at)}</span>
                    </div>
                  ))}
                  {!recentJobs.length ? <p className="p-4 text-sm text-muted-foreground">কোনো job log নেই।</p> : null}
                </div>
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

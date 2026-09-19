import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  approveEditorialAngle,
  generateEditorialOutline,
  prepareEditorialBrief,
  setEditorialType,
} from "@/lib/desk/editorial.functions";
import { generateDeskArticle } from "@/lib/desk/article.functions";

type EditorialType = "news" | "explainer" | "feature";

type Props = {
  storyId: string;
  story: any;
  sources: any[];
  onRefresh: () => Promise<void>;
};

function label(type: EditorialType) {
  if (type === "explainer") return "Explainer";
  if (type === "feature") return "Feature";
  return "News";
}

export function EditorialWorkflowPanel({ storyId, story, sources, onRefresh }: Props) {
  const setType = useServerFn(setEditorialType);
  const prepareBrief = useServerFn(prepareEditorialBrief);
  const approveAngle = useServerFn(approveEditorialAngle);
  const makeOutline = useServerFn(generateEditorialOutline);
  const writeArticle = useServerFn(generateDeskArticle);

  const [busy, setBusy] = useState(false);
  const [selectedAngleId, setSelectedAngleId] = useState("");
  const editorialType: EditorialType =
    story.editorial_type === "feature" || story.editorial_type === "explainer"
      ? story.editorial_type
      : "news";
  const brief = story.editorial_brief || null;
  const approvedAngle = story.approved_angle || null;
  const outline = story.editorial_outline || null;
  const currentAngleId = selectedAngleId || approvedAngle?.id || "";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "কাজটি সম্পন্ন হয়নি");
    } finally {
      setBusy(false);
    }
  }

  async function chooseType(type: EditorialType) {
    await run(async () => {
      await setType({ data: { id: storyId, editorialType: type } });
      toast.success(label(type) + " mode selected");
      await onRefresh();
    });
  }

  return (
    <section className="mb-8 border border-border p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-bold">Editorial Workflow</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            News-এর জন্য বর্তমান workflow। Explainer/Feature-এর জন্য multi-angle research → angle approval → outline → article।
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(["news", "explainer", "feature"] as const).map((type) => (
            <button
              key={type}
              type="button"
              disabled={busy}
              onClick={() => chooseType(type)}
              className={
                editorialType === type
                  ? "bg-primary px-3 py-1 text-primary-foreground"
                  : "border border-border px-3 py-1"
              }
            >
              {label(type)}
            </button>
          ))}
        </div>
      </div>

      {editorialType === "news" ? (
        <p className="mt-4 text-xs text-muted-foreground">
          News mode-এ existing AI Research + AI Article workflow ব্যবহার হবে।
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="border border-border bg-secondary/30 p-3">
            <p className="font-medium">
              {editorialType === "explainer" ? "Explainer Research Desk" : "Feature Research Desk"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Topic → multi-angle research → approved angle → outline → article. Discovery result lead হিসেবে দেখা হবে, verified fact হিসেবে নয়।
            </p>
            {sources.length < 2 ? (
              <p className="mt-2 text-xs text-destructive">
                Article লেখার আগে অন্তত ২টি relevant source story-তে যোগ করুন। Research Brief discovery snippets দিয়েও শুরু হতে পারে।
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const out = await prepareBrief({ data: { id: storyId } });
                  toast.success(
                    "Research Brief ready · " +
                      (out.brief.angle_options?.length || 0) +
                      " angles",
                  );
                  setSelectedAngleId("");
                  await onRefresh();
                })
              }
              className="mt-3 bg-primary px-4 py-2 text-xs text-primary-foreground"
            >
              {brief ? "Research Brief আবার তৈরি করুন" : "Research Brief তৈরি করুন"}
            </button>
          </div>

          {brief ? (
            <div className="border border-border p-3">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium">Central question</p>
                  <p className="mt-1 leading-relaxed">{brief.central_question || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium">Why it matters</p>
                  <p className="mt-1 leading-relaxed">{brief.why_it_matters || "—"}</p>
                </div>
              </div>

              {Array.isArray(brief.angle_options) && brief.angle_options.length ? (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">Angle options</p>
                    <span className="text-xs text-muted-foreground">
                      {story.angle_status === "approved" ? "Approved" : "Approval required"}
                    </span>
                  </div>
                  <div className="mt-2 space-y-2">
                    {brief.angle_options.map((angle: any) => {
                      const checked = currentAngleId === angle.id;
                      return (
                        <label
                          key={angle.id}
                          className={
                            checked
                              ? "block border border-primary p-3"
                              : "block border border-border p-3"
                          }
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="radio"
                              name="editorial-angle"
                              checked={checked}
                              onChange={() => setSelectedAngleId(angle.id)}
                              className="mt-1"
                            />
                            <div className="min-w-0">
                              <p className="font-medium">{angle.title}</p>
                              <p className="mt-1 text-xs">
                                <strong>Question:</strong> {angle.question}
                              </p>
                              <p className="mt-1 text-xs">
                                <strong>Thesis:</strong> {angle.thesis}
                              </p>
                              {Array.isArray(angle.coverage_plan) && angle.coverage_plan.length ? (
                                <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                                  {angle.coverage_plan.map((item: string) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={busy || !currentAngleId}
                    onClick={() =>
                      run(async () => {
                        const angle = brief.angle_options.find(
                          (item: any) => item.id === currentAngleId,
                        );
                        if (!angle) throw new Error("Angle পাওয়া যায়নি");
                        await approveAngle({ data: { id: storyId, angle } });
                        toast.success("Editorial angle approved");
                        await onRefresh();
                      })
                    }
                    className="mt-3 border border-border px-4 py-2 text-xs disabled:opacity-50"
                  >
                    এই angle approve করুন
                  </button>
                </div>
              ) : null}

              {Array.isArray(brief.key_facts) && brief.key_facts.length ? (
                <div className="mt-4">
                  <p className="font-medium">Key facts / evidence</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {brief.key_facts.slice(0, 12).map((fact: any) => (
                      <li key={fact.text}>{fact.text}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {Array.isArray(brief.contradictions) && brief.contradictions.length ? (
                <div className="mt-4 border border-border bg-secondary/30 p-3">
                  <p className="font-medium">⚠ Contradictions</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {brief.contradictions.map((item: any) => (
                      <li key={item.text}>{item.text}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {Array.isArray(brief.research_gaps) && brief.research_gaps.length ? (
                <div className="mt-4">
                  <p className="font-medium">Research gaps</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                    {brief.research_gaps.map((item: string) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {story.angle_status === "approved" && approvedAngle ? (
            <div className="border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">Approved angle</p>
                  <p className="mt-1 text-sm">{approvedAngle.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{approvedAngle.question}</p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const out = await makeOutline({ data: { id: storyId } });
                      toast.success(
                        "Outline ready · " +
                          (out.outline.sections?.length || 0) +
                          " sections",
                      );
                      await onRefresh();
                    })
                  }
                  className="bg-primary px-4 py-2 text-xs text-primary-foreground"
                >
                  {outline ? "Outline আবার তৈরি করুন" : "Outline তৈরি করুন"}
                </button>
              </div>

              {outline ? (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs font-medium">Headline direction</p>
                  <p className="mt-1 text-sm">{outline.headline_direction || "—"}</p>
                  <p className="mt-3 text-xs font-medium">Hook</p>
                  <p className="mt-1 text-sm leading-relaxed">{outline.hook || "—"}</p>
                  <div className="mt-4 space-y-3">
                    {(outline.sections || []).map((section: any, index: number) => (
                      <div key={section.title + index} className="border border-border p-3">
                        <p className="font-medium">
                          {index + 1}. {section.title}
                        </p>
                        <p className="mt-1 text-xs">{section.purpose}</p>
                        {Array.isArray(section.key_points) ? (
                          <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                            {section.key_points.map((point: string) => (
                              <li key={point}>{point}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs">
                    <strong>Ending:</strong> {outline.ending || "—"}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={busy || sources.length < 2 || story.angle_status !== "approved" || !outline}
              onClick={() =>
                run(async () => {
                  const out = await writeArticle({
                    data: {
                      id: storyId,
                      depth: story.article_depth || "detailed",
                    },
                  });
                  toast.success(
                    out.article.article_status === "needs_review"
                      ? "Feature/Explainer draft saved · needs review"
                      : "Feature/Explainer draft saved",
                  );
                  await onRefresh();
                })
              }
              className="bg-primary px-4 py-2 text-xs text-primary-foreground disabled:opacity-50"
            >
              {story.article_id
                ? "Regenerate Feature/Explainer"
                : editorialType === "explainer"
                  ? "Generate AI Explainer"
                  : "Generate AI Feature"}
            </button>
            {story.article_id ? (
              <a
                href={"/admin/" + story.article_id + "/edit"}
                className="border border-border px-3 py-2 text-xs"
              >
                Open Draft
              </a>
            ) : null}
            <span className="text-xs text-muted-foreground">
              {sources.length} sources · angle {story.angle_status || "pending"} · outline{" "}
              {outline ? "ready" : "not ready"}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

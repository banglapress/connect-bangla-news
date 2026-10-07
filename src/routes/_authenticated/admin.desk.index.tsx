import { createFileRoute } from "@tanstack/react-router";
import { AiNewsroom } from "@/components/ai-newsroom";

export const Route = createFileRoute("/_authenticated/admin/desk/")({
  head: () => ({
    meta: [
      { title: "AI Newsroom — The Connect" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AiNewsroomPage,
});

function AiNewsroomPage() {
  return <AiNewsroom />;
}

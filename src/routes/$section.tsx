import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { RESERVED_SECTIONS } from "@/lib/categories";

export const Route = createFileRoute("/$section")({
  beforeLoad: ({ params }) => {
    if (RESERVED_SECTIONS.includes(params.section)) {
      throw redirect({ to: "/" });
    }
  },
  component: function SectionLayout() {
    return <Outlet />;
  },
});

import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/desk")({
  component: function DeskLayout() {
    return <Outlet />;
  },
});

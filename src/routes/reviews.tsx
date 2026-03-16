import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/reviews")({
  component: () => <Outlet />,
});

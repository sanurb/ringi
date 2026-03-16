import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { RegistryProvider } from "@effect-atom/atom-react";
import { Header } from "./-shared/layout/header";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ringi" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootLayout,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <RegistryProvider defaultIdleTTL={60_000}>{children}</RegistryProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

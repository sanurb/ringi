import { RegistryProvider } from "@effect-atom/atom-react";
import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { useMemo, useState, useCallback } from "react";

import { useKeyboardShortcuts } from "./-shared/hooks/use-keyboard-shortcuts";
import { TodoPanel } from "./-shared/todos/todo-panel";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  component: RootLayout,
  head: () => ({
    links: [{ href: appCss, rel: "stylesheet" }],
    meta: [
      { charSet: "utf8" },
      { content: "width=device-width, initial-scale=1", name: "viewport" },
      { title: "ringi" },
    ],
  }),
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
  const [todosOpen, setTodosOpen] = useState(false);

  const toggleTodos = useCallback(() => setTodosOpen((prev) => !prev), []);
  const closeTodos = useCallback(() => setTodosOpen(false), []);

  const shortcuts = useMemo(
    () => [
      {
        description: "Toggle Todos panel",
        handler: toggleTodos,
        key: "t",
      },
      {
        description: "Show keyboard shortcuts",
        handler: () => {
          console.log(
            "Keyboard shortcuts:\n" +
              "  t — Toggle Todos panel\n" +
              "  ? — Show this help\n" +
              "  n — New review (on Changes/Reviews pages)\n" +
              "  r — Go to Reviews (on Changes page)\n" +
              "  c — Go to Changes (on Reviews page)"
          );
        },
        key: "?",
        shift: true,
      },
    ],
    [toggleTodos]
  );

  // Skip global shortcuts when the todos panel is open (it has its own Escape handler)
  useKeyboardShortcuts(todosOpen ? [] : shortcuts);

  return (
    <div className="flex h-screen flex-col bg-surface-primary">
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
      <TodoPanel isOpen={todosOpen} onClose={closeTodos} />
    </div>
  );
}

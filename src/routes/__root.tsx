import { useMemo, useState, useCallback } from "react";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { RegistryProvider } from "@effect-atom/atom-react";
import { TodoPanel } from "./-shared/todos/todo-panel";
import { useKeyboardShortcuts } from "./-shared/hooks/use-keyboard-shortcuts";
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
  const [todosOpen, setTodosOpen] = useState(false);

  const toggleTodos = useCallback(() => setTodosOpen((prev) => !prev), []);
  const closeTodos = useCallback(() => setTodosOpen(false), []);

  const shortcuts = useMemo(
    () => [
      {
        key: "t",
        description: "Toggle Todos panel",
        handler: toggleTodos,
      },
      {
        key: "?",
        shift: true,
        description: "Show keyboard shortcuts",
        handler: () => {
          console.log(
            "Keyboard shortcuts:\n" +
              "  t — Toggle Todos panel\n" +
              "  ? — Show this help\n" +
              "  n — New review (on Changes/Reviews pages)\n" +
              "  r — Go to Reviews (on Changes page)\n" +
              "  c — Go to Changes (on Reviews page)",
          );
        },
      },
    ],
    [toggleTodos],
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

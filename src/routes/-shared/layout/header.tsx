import { Link } from "@tanstack/react-router";

export function Header() {
  return (
    <header className="flex items-center justify-between border-b border-gray-800 bg-surface-secondary px-6 py-3">
      <div className="flex items-center gap-6">
        <Link to="/" className="text-lg font-bold text-accent-cyan hover:text-accent-cyan/80">
          ringi
        </Link>
        <nav className="flex gap-4">
          <Link
            to="/"
            className="text-sm text-gray-400 hover:text-gray-200 [&.active]:text-accent-cyan"
          >
            Changes
          </Link>
          <Link
            to="/reviews"
            className="text-sm text-gray-400 hover:text-gray-200 [&.active]:text-accent-cyan"
          >
            Reviews
          </Link>
        </nav>
      </div>
    </header>
  );
}

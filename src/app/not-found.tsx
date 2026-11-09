import Link from "next/link";
import { AlertTriangle, Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="rounded-2xl border border-obsidian-800 bg-obsidian-900/80 p-8 max-w-md shadow-2xl backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rcb-red/10 border border-rcb-red/30 mb-4">
          <AlertTriangle className="h-7 w-7 text-rcb-red" />
        </div>
        <h2 className="text-xl font-extrabold text-white mb-2">404 — Component Not Found</h2>
        <p className="text-sm text-obsidian-300 mb-6">
          The requested hardware resource or page could not be located in the PartsPilot registry.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl bg-rcb-red px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-rcb-red/30 hover:bg-rcb-red-hover transition-all"
        >
          <Home className="h-4 w-4" />
          <span>Return to Engineering Workspace</span>
        </Link>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/common/Navbar";
import { getCatalogParts } from "@/lib/catalog/service";

export const metadata: Metadata = {
  title: "PartsPilot | Robotics & Electronics Engineering Procurement",
  description:
    "Deterministic hardware compatibility verification and agentic PayPal commerce for robotics and embedded engineering.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Check live database connectivity
  const { isConnected } = await getCatalogParts();

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-obsidian-950 text-white flex flex-col font-sans antialiased selection:bg-rcb-red/40 selection:text-white"
      >
        <Navbar isDbConnected={isConnected} />
        
        <main className="flex-1">{children}</main>

        <footer className="border-t border-obsidian-800 bg-obsidian-950 py-8 text-xs text-obsidian-400">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-white">PARTS<span className="text-rcb-red">PILOT</span></span>
              <span>—</span>
              <span className="text-obsidian-400">PayPal AI Hackathon 2026</span>
            </div>
            <div className="flex items-center gap-3 text-obsidian-400 text-[11px]">
              <span>Next.js 15</span>
              <span>•</span>
              <span className="text-rcb-red font-semibold">Neon PostgreSQL</span>
              <span>•</span>
              <span>PayPal REST v2 Sandbox</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

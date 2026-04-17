"use client";

import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isAuthPage = pathname === "/" || pathname === "/login";

  // Handle hydration
  useEffect(() => {
    setMounted(true);
  }, []);

  // Auto-close sidebar on navigate (mobile)
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile Sidebar Overlay & Drawer (Client-only to prevent hydration mismatch) */}
      {mounted && (
        <>
          {isSidebarOpen && (
            <div 
              className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] md:hidden animate-in fade-in duration-300"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          <div className={`
            fixed inset-y-0 left-0 w-64 z-[70] bg-surface border-r border-border transform transition-transform duration-300 ease-in-out md:hidden
            ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}>
             <Sidebar onClose={() => setIsSidebarOpen(false)} className="w-full" />
          </div>
        </>
      )}

      {/* Desktop Sidebar (Persistent) */}
      {mounted && <Sidebar className="hidden md:flex sticky top-0 h-screen" />}

      <div className="flex-1 flex flex-col min-w-0 bg-background relative">
        {mounted ? (
          <Header onOpenMenu={() => setIsSidebarOpen(true)} />
        ) : (
          <div className="border-b border-border bg-surface sticky top-0 z-50 min-h-16 py-2" />
        )}
        <main className="flex-1">
          <div className="max-w-6xl mx-auto p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

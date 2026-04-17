"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { navLinks } from "@/components/layout/nav-links";

export function MobileDrawer() {
  const pathname = usePathname();
  const { user } = useCurrentUser();
  const [open, setOpen] = useState(false);

  const visibleLinks = user
    ? navLinks.filter((l) => l.roles.includes(user.role))
    : [];

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Hamburger button — visible only on mobile */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mr-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-[var(--bg-subtle)] md:hidden"
        aria-label="開啟選單"
      >
        <Menu className="h-5 w-5 text-[var(--text-primary)]" strokeWidth={1.5} />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Bottom-sheet drawer */}
      <div
        className={[
          "fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-250 ease-out md:hidden",
          open ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
      >
        <div className="rounded-t-2xl bg-[var(--sidebar-bg)] px-3 pb-8 pt-3">
          {/* Drag indicator */}
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-white/30" />

          {/* Close button */}
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="text-sm font-semibold text-white">選單</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
              aria-label="關閉選單"
            >
              <X className="h-4 w-4 text-white" strokeWidth={1.5} />
            </button>
          </div>

          {/* Nav grid — 2 columns */}
          <nav className="grid grid-cols-2 gap-1">
            {visibleLinks.map((link) => {
              const Icon = link.icon;
              const isActive =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href as never}
                  className={[
                    "flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-3 text-[13px] font-medium text-white transition-colors",
                    "hover:bg-white/12",
                    isActive ? "bg-white/18" : "",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4 shrink-0 text-white" strokeWidth={1.5} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
}

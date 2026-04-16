"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";

import { useCurrentUser } from "@/hooks/useCurrentUser";

export function HeaderUserMenu() {
  const { user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!user) return null;

  const initial = user.displayName.charAt(0).toUpperCase();
  const roleLabel = user.role === "admin" ? "管理員" : "技師";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-[var(--bg-subtle)]"
        aria-label="使用者選單"
      >
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.displayName}
            referrerPolicy="no-referrer"
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sidebar-bg)] text-sm font-semibold text-white">
            {initial}
          </span>
        )}
        <span className="hidden text-sm font-medium text-[var(--text-primary)] sm:inline">
          {user.displayName}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow-lg)]">
          <div className="border-b border-[var(--border)] px-4 py-3">
            <div className="text-sm font-medium text-[var(--text-primary)] truncate">
              {user.displayName}
            </div>
            <div className="mt-0.5 text-xs text-[var(--text-tertiary)] truncate">
              {roleLabel}
            </div>
            <div className="mt-0.5 text-xs text-[var(--text-tertiary)] truncate">
              {user.email}
            </div>
          </div>
          <a
            href="/api/auth/logout"
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-subtle)]"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.5} />
            登出
          </a>
        </div>
      )}
    </div>
  );
}

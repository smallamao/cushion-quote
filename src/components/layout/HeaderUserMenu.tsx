"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, LogOut } from "lucide-react";

import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUnreadReplies } from "@/hooks/useUnreadReplies";
import type { UnreadItem } from "@/hooks/useUnreadReplies";

function formatTime(iso: string): string {
  if (!iso) return "";
  const d = iso.replace("T", " ").slice(0, 16);
  // 只顯示 MM/DD HH:mm
  const date = new Date(iso);
  if (isNaN(date.getTime())) return d;
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

function NotificationPanel({
  items,
  unreadCount,
  onMarkRead,
  onClose,
}: {
  items: UnreadItem[];
  unreadCount: number;
  onMarkRead: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-x-4 top-auto mt-1 w-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)] md:absolute md:inset-auto md:right-0 md:top-full md:w-80">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          通知 {unreadCount > 0 && `(${unreadCount})`}
        </span>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkRead}
            className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            全部已讀
          </button>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto">
        {items.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[var(--text-tertiary)]">
            沒有新通知
          </div>
        ) : (
          items.map((item, i) => (
            <Link
              key={`${item.serviceId}-${item.occurredAt}-${i}`}
              href={`/after-sales/${item.serviceId}` as never}
              onClick={onClose}
              className="block border-b border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--bg-subtle)] last:border-b-0"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  {item.author}
                </span>
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  {formatTime(item.occurredAt)}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--accent)]">
                {item.serviceId}
              </div>
              <div className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">
                {item.content || "(附件)"}
              </div>
            </Link>
          ))
        )}
      </div>

      {unreadCount > 20 && (
        <div className="border-t border-[var(--border)] px-4 py-2 text-center text-[10px] text-[var(--text-tertiary)]">
          顯示最新 20 筆，共 {unreadCount} 筆未讀
        </div>
      )}
    </div>
  );
}

export function HeaderUserMenu() {
  const { user } = useCurrentUser();
  const { unreadCount, items, markAsRead } = useUnreadReplies();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notiOpen, setNotiOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !notiOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (notiOpen && notiRef.current && !notiRef.current.contains(e.target as Node)) {
        setNotiOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen, notiOpen]);

  if (!user) return null;

  const initial = user.displayName.charAt(0).toUpperCase();
  const roleLabel = user.role === "admin" ? "管理員" : "技師";

  function handleMarkRead() {
    void markAsRead();
    setNotiOpen(false);
  }

  return (
    <div className="flex items-center gap-1">
      {/* 通知鈴鐺 */}
      <div ref={notiRef} className="relative">
        <button
          type="button"
          onClick={() => { setNotiOpen((v) => !v); setMenuOpen(false); }}
          className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-subtle)]"
          aria-label="通知"
        >
          <Bell className="h-4.5 w-4.5 text-[var(--text-secondary)]" strokeWidth={1.5} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
        {notiOpen && (
          <NotificationPanel
            items={items}
            unreadCount={unreadCount}
            onMarkRead={handleMarkRead}
            onClose={() => setNotiOpen(false)}
          />
        )}
      </div>

      {/* 使用者頭像選單 */}
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => { setMenuOpen((v) => !v); setNotiOpen(false); }}
          className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors hover:bg-[var(--bg-subtle)]"
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

        {menuOpen && (
          <div className="fixed inset-x-4 top-auto mt-1 w-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow-lg)] md:absolute md:inset-auto md:right-0 md:top-full md:w-52">
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
    </div>
  );
}

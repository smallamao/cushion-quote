"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, ShieldCheck, User as UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { User, UserRole } from "@/lib/types";

export function UsersManagementPanel() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("technician");
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sheets/users", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; users?: User[]; error?: string };
      if (!json.ok) {
        setError(json.error ?? "載入失敗");
      } else {
        setUsers(json.users ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleAdd() {
    if (!newEmail.trim() || !newName.trim()) {
      alert("請填寫 email 和顯示名稱");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sheets/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          displayName: newName.trim(),
          role: newRole,
        }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        alert(json.error ?? "建立失敗");
        return;
      }
      setShowAdd(false);
      setNewEmail("");
      setNewName("");
      setNewRole("technician");
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: User) {
    const next = !user.isActive;
    if (!confirm(`${next ? "啟用" : "停用"} ${user.displayName} (${user.email}) ?`)) {
      return;
    }
    try {
      const res = await fetch("/api/sheets/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, isActive: next }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        alert(json.error ?? "更新失敗");
        return;
      }
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失敗");
    }
  }

  async function changeRole(user: User, role: UserRole) {
    if (user.role === role) return;
    if (
      !confirm(
        `將 ${user.displayName} 角色改為「${role === "admin" ? "管理員" : "技師"}」?`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch("/api/sheets/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, role }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        alert(json.error ?? "更新失敗");
        return;
      }
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失敗");
    }
  }

  async function renameUser(user: User) {
    const newDisplayName = prompt(`新的顯示名稱 (目前: ${user.displayName})`, user.displayName);
    if (!newDisplayName || newDisplayName.trim() === user.displayName) return;
    try {
      const res = await fetch("/api/sheets/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, displayName: newDisplayName.trim() }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        alert(json.error ?? "更新失敗");
        return;
      }
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失敗");
    }
  }

  async function changeEmail(user: User) {
    const newEmail = prompt(`新的 Email (目前: ${user.email})`, user.email);
    if (!newEmail || newEmail.trim().toLowerCase() === user.email) return;
    try {
      const res = await fetch("/api/sheets/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, email: newEmail.trim() }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) {
        alert(json.error ?? "更新失敗");
        return;
      }
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失敗");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">
          管理系統使用者帳號與角色
        </p>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5" />
          新增使用者
        </Button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          載入中...
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] text-xs uppercase text-[var(--text-secondary)]">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">顯示名稱</th>
                <th className="px-3 py-2 text-left">角色</th>
                <th className="px-3 py-2 text-left">狀態</th>
                <th className="px-3 py-2 text-left">建立時間</th>
                <th className="px-3 py-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-center text-xs text-[var(--text-tertiary)]"
                  >
                    尚無使用者
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.userId}
                    className={`border-t border-[var(--border)] ${u.isActive ? "" : "opacity-50"}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{u.userId}</td>
                    <td className="px-3 py-2 text-xs">{u.email}</td>
                    <td className="px-3 py-2">{u.displayName}</td>
                    <td className="px-3 py-2">
                      {u.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[11px] text-purple-700">
                          <ShieldCheck className="h-3 w-3" />
                          管理員
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">
                          <UserIcon className="h-3 w-3" />
                          技師
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {u.isActive ? (
                        <span className="text-emerald-600">啟用</span>
                      ) : (
                        <span className="text-[var(--text-tertiary)]">停用</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                      {u.createdAt?.slice(0, 10) ?? ""}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => changeEmail(u)}>
                          改信箱
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => renameUser(u)}>
                          改名
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            changeRole(u, u.role === "admin" ? "technician" : "admin")
                          }
                        >
                          {u.role === "admin" ? "降為技師" : "升為管理員"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleActive(u)}
                          className={u.isActive ? "text-red-600" : "text-emerald-600"}
                        >
                          {u.isActive ? "停用" : "啟用"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-lg)]">
            <h3 className="mb-4 text-base font-semibold">新增使用者</h3>
            <div className="space-y-3">
              <div>
                <Label className="mb-1 block text-xs">Google Email *</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="例: technician1@gmail.com"
                />
                <p className="mt-1 text-[10px] text-[var(--text-tertiary)]">
                  必須是 Gmail / Google Workspace,使用者會用此帳號 Google 登入
                </p>
              </div>
              <div>
                <Label className="mb-1 block text-xs">顯示名稱 *</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例: 阿明"
                />
              </div>
              <div>
                <Label className="mb-1 block text-xs">角色</Label>
                <div className="flex gap-2">
                  <label className="flex items-center gap-1 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="newRole"
                      value="technician"
                      checked={newRole === "technician"}
                      onChange={() => setNewRole("technician")}
                    />
                    技師 (只能看售後服務)
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer text-sm">
                    <input
                      type="radio"
                      name="newRole"
                      value="admin"
                      checked={newRole === "admin"}
                      onChange={() => setNewRole("admin")}
                    />
                    管理員 (全部權限)
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAdd(false)}
                disabled={saving}
              >
                取消
              </Button>
              <Button onClick={handleAdd} disabled={saving}>
                {saving ? "建立中..." : "建立"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

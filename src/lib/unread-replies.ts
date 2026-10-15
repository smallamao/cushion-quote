export interface UnreadItem {
  serviceId: string;
  author: string;
  content: string;
  occurredAt: string;
}

export interface UnreadScope {
  /** 這個人上次把回覆標為已讀的時間 */
  lastRead: string;
  /** 用來排除自己寫的回覆 */
  displayName: string;
  isAdmin: boolean;
  /** 指派給這個人的售後單號。非 admin 只看得到這些單的回覆 */
  assignedServiceIds: ReadonlySet<string>;
}

/**
 * 從回覆列挑出「這個人該看到的未讀」。
 *
 * 🔴 2026-10-15 第二輪稽核：原本的條件只有「時間 > 上次已讀」與「作者不是自己」，
 *    完全沒有比對這張單是不是他的。師傅因此看得到**所有**售後單的回覆前 80 字——
 *    包含其他師傅的案子，以及客人在那些單裡寫的內容。
 *
 * 非 admin 沒有任何指派時回空陣列，不是回全部——這是刻意的 fail-closed。
 */
export function selectUnreadReplies(
  replyRows: readonly string[][],
  scope: UnreadScope,
): UnreadItem[] {
  const items: UnreadItem[] = [];
  for (const row of replyRows) {
    const serviceId = row[1] ?? "";
    const occurredAt = row[2] ?? "";
    const author = row[3] ?? "";
    if (occurredAt <= scope.lastRead) continue;
    if (author === scope.displayName) continue;
    if (!scope.isAdmin && !scope.assignedServiceIds.has(serviceId)) continue;
    items.push({ serviceId, author, content: (row[4] ?? "").slice(0, 80), occurredAt });
  }
  return items;
}

export function pickStartupFile(
  pending: string | null,
  reopenLast: boolean,
  lastFile: string | null,
): { path: string; source: "pending" | "last" } | null {
  if (pending) return { path: pending, source: "pending" };
  if (reopenLast && lastFile) return { path: lastFile, source: "last" };
  return null;
}

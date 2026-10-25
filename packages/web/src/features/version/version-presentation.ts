export function commitTitle(message: string | undefined, fallback: string): string {
  if (message === undefined || message.trim().length === 0) return fallback;
  const lines = message.split(/\r?\n/);
  const summary = lines.findIndex((line) => /^##\s+简介\s*$/.test(line.trim()));
  const candidates = summary === -1 ? lines : lines.slice(summary + 1);
  return (
    candidates.find((line) => line.trim().length > 0 && !/^#{1,6}\s/.test(line.trim()))?.trim() ??
    fallback
  );
}

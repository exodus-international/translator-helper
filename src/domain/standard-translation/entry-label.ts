const MAX_LENGTH = 60;

/** How a confirmation or a menu names an entry: its name, or the start of its source. */
export function entryLabel(entry: { name: string | null; sourceText: string }): string {
  if (entry.name) return entry.name;
  const source = entry.sourceText.replace(/\s+/g, ' ').trim();
  return source.length > MAX_LENGTH ? `${source.slice(0, MAX_LENGTH - 1)}…` : source;
}

/**
 * Locates the parts of a document that prose rules must not touch.
 *
 * The corpus embeds a lot of raw HTML (158k `<br>`, 12k `<a href="...">`,
 * `<style>` blocks, YouTube `<iframe>`s). Most straight quotes in a typical
 * file live inside those attributes, so a naive smart-quote pass would rewrite
 * markup and break the page. Every rule that edits prose filters its matches
 * through `isProtected` first.
 */

export interface Region {
  from: number;
  to: number;
}

const FRONTMATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---/;

/** Offsets of the frontmatter block, or null when the document has none. */
export function frontmatterRegion(text: string): Region | null {
  const match = FRONTMATTER.exec(text);
  return match ? { from: 0, to: match[0].length } : null;
}

/**
 * Regions that are markup or data rather than prose: frontmatter, fenced and
 * inline code, HTML tags and their attributes, `<style>`/`<script>` bodies,
 * HTML comments, and link/image destinations.
 */
export function protectedRegions(text: string): Region[] {
  const regions: Region[] = [];
  const push = (from: number, to: number) => {
    if (to > from) regions.push({ from, to });
  };

  const front = frontmatterRegion(text);
  if (front) push(front.from, front.to);

  const patterns: RegExp[] = [
    /<!--[\s\S]*?-->/g, // HTML comments
    /<(style|script)\b[\s\S]*?<\/\1>/gi, // style/script bodies
    /```[\s\S]*?```/g, // fenced code
    /`[^`\n]*`/g, // inline code
    /<\/?[a-zA-Z][^>]*>/g, // HTML tags incl. attributes
    /!?\[[^\]]*\]\(([^)]*)\)/g, // link/image destination
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const start = match.index ?? 0;
      if (pattern.source.startsWith('!?\\[')) {
        // Protect only the destination, so link *text* is still linted.
        const open = match[0].lastIndexOf('(');
        push(start + open, start + match[0].length);
      } else {
        push(start, start + match[0].length);
      }
    }
  }

  return merge(regions);
}

function merge(regions: Region[]): Region[] {
  if (regions.length === 0) return regions;
  const sorted = [...regions].sort((a, b) => a.from - b.from);
  const merged: Region[] = [sorted[0]];
  for (const region of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (region.from <= last.to) last.to = Math.max(last.to, region.to);
    else merged.push(region);
  }
  return merged;
}

/** True when `offset` falls inside any region. Regions must be sorted+merged. */
export function isProtected(regions: Region[], offset: number): boolean {
  let low = 0;
  let high = regions.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (offset < regions[mid].from) high = mid - 1;
    else if (offset >= regions[mid].to) low = mid + 1;
    else return true;
  }
  return false;
}

import yaml from 'js-yaml';

export type Frontmatter = {
  data: Record<string, unknown>;
  content: string;
};

// gray-matter parity notes (it was replaced for js-yaml 3.x security reasons):
// - tolerate trailing whitespace after the opening delimiter
// - strip a UTF-8 BOM before matching (gray-matter did the same)
// - content excludes exactly one newline after the closing delimiter
const FRONTMATTER_DELIMITER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/;
const LEADING_NEWLINE = /^\r?\n/;
const BOM = 0xfeff;

export function parseFrontmatter(text: string): Frontmatter {
  if (text.charCodeAt(0) === BOM) text = text.slice(1);

  const match = FRONTMATTER_DELIMITER.exec(text);
  if (!match) return { data: {}, content: text };

  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = yaml.load(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    data = {};
  }

  return { data, content: text.slice(match[0].length).replace(LEADING_NEWLINE, '') };
}

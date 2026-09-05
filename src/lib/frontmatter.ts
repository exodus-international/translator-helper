import yaml from 'js-yaml';

export type Frontmatter = {
  data: Record<string, unknown>;
  content: string;
};

const FRONTMATTER_DELIMITER = /^---\r?\n([\s\S]*?)\r?\n---/;

export function parseFrontmatter(text: string): Frontmatter {
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

  return { data, content: text.slice(match[0].length) };
}

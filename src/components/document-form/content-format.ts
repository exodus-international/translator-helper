/**
 * Determines how a document's content should be labelled/edited, based on its
 * original filename. Root files can be YAML (e.g. disciplines.yml, metadata.yml);
 * everything else is treated as Markdown. Defaults to Markdown when no filename
 * is set yet.
 */
export function getContentFormat(originalFilename: string): 'YAML' | 'Markdown' {
  return /\.ya?ml$/i.test(originalFilename) ? 'YAML' : 'Markdown';
}

/**
 * Monaco language id for syntax highlighting, derived from the same signal as
 * {@link getContentFormat}.
 */
export function getEditorLanguage(originalFilename: string): 'yaml' | 'markdown' {
  return getContentFormat(originalFilename) === 'YAML' ? 'yaml' : 'markdown';
}

/**
 * What the confirmation for deleting a source project says. A project's
 * standard translations are deleted with it (they are its own, and as general
 * entries they would apply to every project in the language), so the dialog
 * names how many go before anyone confirms.
 */
export function deleteProjectDescription(name: string, standardTranslations: number): string {
  const entries =
    standardTranslations === 0
      ? ''
      : ` Its ${standardTranslations} standard translation${standardTranslations === 1 ? '' : 's'} will be deleted with it.`;
  return `Are you sure you want to delete "${name}"?${entries} This action cannot be undone.`;
}

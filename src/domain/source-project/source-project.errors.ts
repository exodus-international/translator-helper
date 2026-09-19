/**
 * Name, slug and repository directory are each unique. Prisma reports a
 * collision as a P2002, which reaches the dialog as an unreadable stack unless
 * it is turned into a sentence. The slug is filled in from the project name,
 * so a collision is something an admin runs into by naming two projects alike
 * rather than by doing anything wrong.
 *
 * Which column collided is reported differently depending on the engine: as
 * `meta.target` on some, and only as the index name inside the message
 * ("...failed on the constraint: `source_project_slug_key`") under the pg
 * driver adapter this app uses. Both are read, and nothing else in the error
 * is, so an unrelated word in a stack cannot be mistaken for a field.
 *
 * Lives outside source-project.actions.ts because that file is `use server`,
 * where every export has to be an async action.
 */
const UNIQUE_FIELD_MESSAGES: [field: string, message: string][] = [
  ['repositoryDirectory', 'Another project already deploys to that repository directory'],
  ['slug', 'A project with that URL slug already exists'],
  ['name', 'A project with that name already exists'],
];

export function rethrowUniqueViolation(error: unknown): never {
  const { code, meta, message } = (error ?? {}) as { code?: string; meta?: { target?: unknown }; message?: string };
  if (code !== 'P2002') throw error;

  const target = Array.isArray(meta?.target) ? meta.target.join(',') : String(meta?.target ?? '');
  const constraint = /constraint: `([^`]+)`/.exec(message ?? '')?.[1] ?? '';
  const match = UNIQUE_FIELD_MESSAGES.find(([field]) => target.includes(field) || constraint.includes(field));

  throw match ? new Error(match[1]) : error;
}

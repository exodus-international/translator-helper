/**
 * Turns the project dialog's fields into the shapes the create and update
 * actions accept. Kept out of the component so it can be tested against the
 * schemas without React.
 */

export interface ProjectFormValues {
  name: string;
  description: string;
  /** URL segment, auto-filled from the name until someone edits it. */
  slug: string;
  /** Folder in the content repository. Only meaningful while `deployToGithub` is on. */
  repositoryDirectory: string;
  acronym: string;
  /** Whether this project's documents deploy to the GitHub content repository. */
  deployToGithub: boolean;
}

export const EMPTY_PROJECT_FORM: ProjectFormValues = {
  name: '',
  description: '',
  slug: '',
  repositoryDirectory: '',
  acronym: '',
  deployToGithub: true,
};

/**
 * The slug a name suggests. Matches `segment` in source-project.types.ts, so
 * what the form proposes is always something the schema accepts: accents are
 * folded to ASCII, every other run of characters becomes a single dash, and
 * the ends are trimmed.
 *
 * A name that slugifies to nothing — only punctuation, or a script with no
 * ASCII equivalent — yields an empty string rather than a broken slug, which
 * leaves the field for the admin to fill in and the submit button disabled
 * until they do.
 */
export function slugifyProjectName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Create takes `description` as optional but not nullable, so an empty box has
 * to become `undefined` here. Sending `null` instead is what broke project
 * creation from the dashboard whenever the description was left blank (#140).
 *
 * `deployToGithub` is local form UX only, not sent to the server: it decides
 * whether a repository directory goes along. Whether a deploy actually happens
 * is read from that directory being set.
 */
export function toCreateProjectInput(values: ProjectFormValues) {
  return {
    name: values.name.trim(),
    description: values.description.trim() || undefined,
    slug: values.slug.trim(),
    repositoryDirectory: values.deployToGithub ? values.repositoryDirectory.trim() : undefined,
    acronym: values.acronym.trim() || null,
  };
}

/**
 * Update takes `description` as nullable, where `null` clears it. The
 * asymmetry with create is the whole reason both shapes are built here rather
 * than written out at each call site.
 */
export function toUpdateProjectInput(values: ProjectFormValues) {
  return {
    name: values.name.trim(),
    description: values.description.trim() || null,
    slug: values.slug.trim(),
    repositoryDirectory: values.deployToGithub ? values.repositoryDirectory.trim() : null,
    acronym: values.acronym.trim() || null,
  };
}

/** True when the required fields are filled, for disabling a submit button. */
export function isProjectFormComplete(values: ProjectFormValues): boolean {
  return Boolean(
    values.name.trim() && values.slug.trim() && (!values.deployToGithub || values.repositoryDirectory.trim()),
  );
}

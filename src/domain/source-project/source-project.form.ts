/**
 * Turns the project dialog's fields into the shapes the create and update
 * actions accept. Kept out of the component so it can be tested against the
 * schemas without React.
 */

export interface ProjectFormValues {
  name: string;
  description: string;
  identifier: string;
  acronym: string;
}

export const EMPTY_PROJECT_FORM: ProjectFormValues = {
  name: '',
  description: '',
  identifier: '',
  acronym: '',
};

/**
 * Create takes `description` as optional but not nullable, so an empty box has
 * to become `undefined` here. Sending `null` instead is what broke project
 * creation from the dashboard whenever the description was left blank (#140).
 */
export function toCreateProjectInput(values: ProjectFormValues) {
  return {
    name: values.name.trim(),
    description: values.description.trim() || undefined,
    identifier: values.identifier.trim(),
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
    identifier: values.identifier.trim(),
    acronym: values.acronym.trim() || null,
  };
}

/** True when the required fields are filled, for disabling a submit button. */
export function isProjectFormComplete(values: ProjectFormValues): boolean {
  return Boolean(values.name.trim() && values.identifier.trim());
}

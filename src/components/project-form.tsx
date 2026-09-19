'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TriangleAlert } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  EMPTY_PROJECT_FORM,
  isProjectFormComplete,
  slugifyProjectName,
  toCreateProjectInput,
  toUpdateProjectInput,
  type ProjectFormValues,
} from '@/domain/source-project/source-project.form';

/**
 * The fields a source project is created and edited with, shared by the
 * dashboard dialog and the admin dialog.
 *
 * Each site keeps its own dialog chrome: the admin one is rendered through
 * AdminListPage, which owns the Dialog, the form and the submit button, and is
 * shared with the languages page. Only the fields and the payload are common,
 * and the payload is the half that was drifting.
 */

export type { ProjectFormValues };
export { isProjectFormComplete, toCreateProjectInput, toUpdateProjectInput };

/**
 * Mirrors `segment` in source-project.types.ts. As an input `pattern` it is
 * enforced by the browser on submit, so both dialogs reject a bad slug or
 * directory before it becomes a masked server action error.
 */
const SEGMENT_PATTERN = '[a-z0-9]+([-_][a-z0-9]+)*';

/** A lone dash turns day naming off, so it has to pass alongside real acronyms. */
const ACRONYM_PATTERN = '-|[^\\s-]+';

/**
 * The slug follows the name while it is being typed, and stops as soon as
 * someone edits it by hand — the two are only coupled until the admin says
 * otherwise. Editing an existing project starts detached: its slug is already
 * in URLs people hold, so renaming the project must not quietly move it.
 */
export function useProjectForm(initial?: Partial<ProjectFormValues>) {
  const [values, setValues] = useState<ProjectFormValues>({ ...EMPTY_PROJECT_FORM, ...initial });
  const slugDetached = useRef(Boolean(initial?.slug));

  const set = <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => {
    if (key === 'slug') slugDetached.current = true;

    setValues((current) => {
      const next = { ...current, [key]: value };
      if (key === 'name' && !slugDetached.current) {
        next.slug = slugifyProjectName(value as string);
      }
      return next;
    });
  };

  const reset = (next?: Partial<ProjectFormValues>) => {
    slugDetached.current = Boolean(next?.slug);
    setValues({ ...EMPTY_PROJECT_FORM, ...next });
  };

  return { values, set, reset };
}

interface ProjectFormFieldsProps {
  values: ProjectFormValues;
  onChange: <K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) => void;
  /** Keeps input ids unique and stable per dialog. */
  idPrefix?: string;
}

export function ProjectFormFields({ values, onChange, idPrefix = 'project' }: ProjectFormFieldsProps) {
  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}-name`}>Project Name *</Label>
        <Input
          id={`${idPrefix}-name`}
          value={values.name}
          onChange={(e) => onChange('name', e.target.value)}
          placeholder="e.g., Exodus90, Daily Readings"
          required
          minLength={2}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={values.description}
          onChange={(e) => onChange('description', e.target.value)}
          placeholder="Optional description of the project"
          rows={3}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-slug`}>URL Slug *</Label>
        <Input
          id={`${idPrefix}-slug`}
          value={values.slug}
          onChange={(e) => onChange('slug', e.target.value)}
          placeholder="e.g., exodus90, lent2026"
          required
          pattern={SEGMENT_PATTERN}
          className="mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Where the project lives: /projects/{values.slug || 'exodus90'}. Filled in from the name, and editable.
        </p>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-deploy-to-github`} className="flex items-center gap-2 text-sm font-medium">
          <input
            id={`${idPrefix}-deploy-to-github`}
            type="checkbox"
            checked={values.deployToGithub}
            onChange={(e) => onChange('deployToGithub', e.target.checked)}
          />
          Deploy to GitHub
        </label>
      </div>
      {values.deployToGithub ? (
        <div>
          <Label htmlFor={`${idPrefix}-repository-directory`}>Repository Directory *</Label>
          <Input
            id={`${idPrefix}-repository-directory`}
            value={values.repositoryDirectory}
            onChange={(e) => onChange('repositoryDirectory', e.target.value)}
            placeholder="e.g., exodus90, lent2026, october_2026"
            required
            pattern={SEGMENT_PATTERN}
            className="mt-1"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Folder name in the content repository. Lowercase letters, numbers, dashes and underscores.
          </p>
        </div>
      ) : (
        <DeployOffWarning />
      )}
      <div>
        <Label htmlFor={`${idPrefix}-acronym`}>Acronym</Label>
        <Input
          id={`${idPrefix}-acronym`}
          value={values.acronym}
          onChange={(e) => onChange('acronym', e.target.value)}
          placeholder="e.g., SML"
          pattern={ACRONYM_PATTERN}
          className="mt-1"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Prefixes the title of uploaded days, as in &quot;SML - DAY 03 - ...&quot;. Leave empty to number days
          without a prefix, or enter a single dash to leave titles alone.
        </p>
      </div>
    </>
  );
}

/**
 * Turning the toggle off is not a neutral setting: translations still move
 * through the workflow and still reach Deployed, they just never reach the
 * content repository. Said plainly here so nobody discovers it by looking for
 * a pull request that was never opened.
 */
export function DeployOffWarning() {
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-warning">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <p className="text-xs">
        Documents in this project will not be deployed to the GitHub content repository. They can still be translated,
        reviewed and marked as deployed — nothing will be published.
      </p>
    </div>
  );
}

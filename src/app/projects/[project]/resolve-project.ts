import {
  getSourceProjectAction,
  getSourceProjectByIdentifierAction,
} from '@/domain/source-project/source-project.actions';
import { buildProjectPath } from '@/domain/source-project/source-project-url';
import { isUuid } from '@/lib/uuid';
import { notFound, redirect } from 'next/navigation';

/**
 * The {project} segment is a SourceProject.identifier. Links shared before that
 * change put the row id there instead, so a UUID is accepted and redirected to
 * the readable path rather than rendered, which keeps one URL per page.
 *
 * A 307 rather than a permanent redirect, for the same reason as the document
 * routes: an admin can rename an identifier, and a cached 308 would keep
 * sending people to a path that no longer exists.
 *
 * `subPath` is appended to the redirect target so nested pages land on their
 * own readable URL instead of the project root.
 */
export async function resolveProject(segment: string, subPath = ''): Promise<SourceProjectDetail> {
  if (isUuid(segment)) {
    const project = await getSourceProjectAction(segment);

    if (!project) {
      notFound();
    }

    redirect(`${buildProjectPath(project.identifier)}${subPath}`);
  }

  const project = await getSourceProjectByIdentifierAction(segment);

  if (!project) {
    notFound();
  }

  return project;
}

type SourceProjectDetail = NonNullable<Awaited<ReturnType<typeof getSourceProjectAction>>>;

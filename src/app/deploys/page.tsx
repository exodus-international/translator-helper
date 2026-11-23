import { redirect } from 'next/navigation';
import { DeploysPanel } from '@/components/deploy/deploys-panel';
import { PageHeader } from '@/components/page-header';
import { getUserLanguages } from '@/domain/user-language/user-language.repository';
import { getCurrentUser } from '@/lib/session';

/**
 * Every deploy the person may see, newest first: all of them for an
 * administrator, their own languages' for anyone on a team. "Deploy approved"
 * here sends everything approved in those languages.
 */
export default async function DeploysPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const isAdmin = user.role === 'ADMIN';
  const memberships = isAdmin ? [] : await getUserLanguages(user.id);
  const canDeploy = isAdmin || memberships.length > 0;

  return (
    <>
      <PageHeader
        title="Deploys"
        description={
          isAdmin
            ? 'What went out to GitHub, for every language.'
            : 'What went out to GitHub for the languages you are on.'
        }
      />
      <div className="max-w-3xl px-4 py-4">
        <DeploysPanel
          title="History"
          description={
            isAdmin
              ? 'Deploy approved sends every approved document, in every language, in one commit.'
              : 'Deploy approved sends every approved document in your languages in one commit.'
          }
          filter={{}}
          scope={{}}
          via="deploys_page"
          canDeploy={canDeploy}
          emptyText={canDeploy ? 'Nothing has been deployed yet.' : 'You are not on a language team yet, so there are no deploys to show.'}
        />
      </div>
    </>
  );
}

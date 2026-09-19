import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rethrowUniqueViolation } from './source-project.errors';

/** What Prisma throws under the pg driver adapter: no `meta.target` at all. */
function pgAdapterViolation(constraint: string) {
  return Object.assign(
    new Error(`Invalid \`prisma.sourceProject.create()\` invocation:\n\nUnique constraint failed on the constraint: \`${constraint}\``),
    { code: 'P2002', meta: { modelName: 'SourceProject' } },
  );
}

/** What other engines throw: the offending columns in `meta.target`. */
function targetViolation(...columns: string[]) {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target: columns } });
}

function messageFrom(error: unknown): string {
  try {
    rethrowUniqueViolation(error);
  } catch (thrown) {
    return (thrown as Error).message;
  }
  throw new Error('rethrowUniqueViolation returned instead of throwing');
}

describe('rethrowUniqueViolation', () => {
  it('names the field from the index name, which is all the pg adapter reports', () => {
    assert.equal(messageFrom(pgAdapterViolation('source_project_slug_key')), 'A project with that URL slug already exists');
    assert.equal(messageFrom(pgAdapterViolation('source_project_name_key')), 'A project with that name already exists');
    assert.equal(
      messageFrom(pgAdapterViolation('source_project_repositoryDirectory_key')),
      'Another project already deploys to that repository directory',
    );
  });

  it('names the field from meta.target when an engine reports one', () => {
    assert.equal(messageFrom(targetViolation('slug')), 'A project with that URL slug already exists');
    assert.equal(
      messageFrom(targetViolation('repositoryDirectory')),
      'Another project already deploys to that repository directory',
    );
  });

  // "repositoryDirectory" is checked before "name" so the longer field is not
  // read as the shorter one where both could match.
  it('prefers the more specific field when an index name could match two', () => {
    assert.equal(
      messageFrom(pgAdapterViolation('source_project_name_repositoryDirectory_key')),
      'Another project already deploys to that repository directory',
    );
  });

  it('passes anything that is not a unique violation straight through', () => {
    const other = Object.assign(new Error('Record to update not found'), { code: 'P2025' });
    assert.equal(messageFrom(other), 'Record to update not found');
    assert.equal(messageFrom(new Error('boom')), 'boom');
  });

  // A collision on a column this module says nothing about should not be
  // relabelled as one it does know.
  it('passes an unrecognised unique violation through unchanged', () => {
    const message = messageFrom(pgAdapterViolation('source_project_acronym_key'));
    assert.match(message, /source_project_acronym_key/);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deleteProjectDescription } from './source-project-delete';

describe('deleteProjectDescription', () => {
  it('says nothing about standard translations when the project has none', () => {
    assert.equal(
      deleteProjectDescription('Exodus 90', 0),
      'Are you sure you want to delete "Exodus 90"? This action cannot be undone.',
    );
  });

  it('names the one standard translation that goes with the project', () => {
    assert.equal(
      deleteProjectDescription('Exodus 90', 1),
      'Are you sure you want to delete "Exodus 90"? Its 1 standard translation will be deleted with it. This action cannot be undone.',
    );
  });

  it('names how many standard translations go with the project', () => {
    assert.equal(
      deleteProjectDescription('Exodus 90', 3),
      'Are you sure you want to delete "Exodus 90"? Its 3 standard translations will be deleted with it. This action cannot be undone.',
    );
  });
});

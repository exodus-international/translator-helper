import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatIssues } from '@/lib/validation';
import { createLanguageSchema, updateLanguageSettingsSchema } from './language.types';

const SETTINGS = {
  name: 'Croatian',
  branchName: 'hr-croatian-translation',
  audioProvider: null,
  audioVoice: null,
};

describe('updateLanguageSettingsSchema', () => {
  it('rejects an attempt to change the code, because the code is the URL', () => {
    // /languages/hr and /documents/exodus90/day-1/hr both key off it. The old
    // form only happened to disable the input; the rule belongs here.
    assert.throws(() => updateLanguageSettingsSchema.parse({ ...SETTINGS, code: 'hrv' }));
  });

  it('accepts the four fields a language settings page owns', () => {
    const parsed = updateLanguageSettingsSchema.parse({
      ...SETTINGS,
      audioProvider: 'AZURE_SPEECH',
      audioVoice: 'hr-HR-SreckoNeural',
    });

    assert.equal(parsed.name, 'Croatian');
    assert.equal(parsed.branchName, 'hr-croatian-translation');
    assert.equal(parsed.audioVoice, 'hr-HR-SreckoNeural');
  });

  it('refuses a provider with no voice, which would generate nothing', () => {
    assert.throws(() => updateLanguageSettingsSchema.parse({ ...SETTINGS, audioProvider: 'AZURE_SPEECH' }));
  });

  it('reads a blank voice as no voice', () => {
    assert.equal(updateLanguageSettingsSchema.parse({ ...SETTINGS, audioVoice: '   ' }).audioVoice, null);
  });

  it('rejects a blank branch name', () => {
    assert.throws(() => updateLanguageSettingsSchema.parse({ ...SETTINGS, branchName: '  ' }));
  });
});

describe('createLanguageSchema', () => {
  it('requires a branch at creation, so a deploy cannot be the first to find out', () => {
    assert.throws(() => createLanguageSchema.parse({ code: 'pl', name: 'Polish' }));
  });

  it('accepts a code, a name and a branch', () => {
    assert.deepEqual(createLanguageSchema.parse({ code: 'pl', name: 'Polish', branchName: 'pl-polish-translation' }), {
      code: 'pl',
      name: 'Polish',
      branchName: 'pl-polish-translation',
    });
  });
});

describe('the messages these rules reject with', () => {
  // Zod's defaults read like a stack trace ("Too small: expected string to
  // have >=2 characters"). These reach a toast, so they are written to follow
  // the field name the formatter puts in front of them.
  const messageFor = (input: unknown) => {
    const result = updateLanguageSettingsSchema.safeParse(input);
    assert.equal(result.success, false);
    return result.success === false ? formatIssues(result.error) : '';
  };

  it('says what a name needs, without Zod vocabulary', () => {
    assert.equal(messageFor({ ...SETTINGS, name: 'X' }), 'name: must be at least two characters');
  });

  it('says why a branch matters', () => {
    assert.equal(
      messageFor({ ...SETTINGS, branchName: '' }),
      'branchName: is required: without a branch, every deploy of this language fails',
    );
  });

  it('lets a whole-object rule speak without a field name', () => {
    assert.equal(
      messageFor({ ...SETTINGS, audioProvider: 'AZURE_SPEECH', audioVoice: null }),
      'A voice is required when a provider is selected',
    );
  });

  it('says a code is two to five characters', () => {
    const result = createLanguageSchema.safeParse({ code: 'h', name: 'Croatian', branchName: 'x' });
    assert.equal(result.success, false);
    assert.equal(
      result.success === false && formatIssues(result.error),
      'code: must be two to five characters, like hr or en-US',
    );
  });
});

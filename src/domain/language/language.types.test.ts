import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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

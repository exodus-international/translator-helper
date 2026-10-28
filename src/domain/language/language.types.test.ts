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
  it('reads absent or blank narration as the app default', () => {
    const parsed = updateLanguageSettingsSchema.parse(SETTINGS);
    assert.equal(parsed.audioRate, null);
    assert.equal(parsed.audioPitch, null);

    const blank = updateLanguageSettingsSchema.parse({ ...SETTINGS, audioRate: ' ', audioPitch: '' });
    assert.equal(blank.audioRate, null);
    assert.equal(blank.audioPitch, null);
  });

  it('accepts the rate and pitch the Slovak team tuned', () => {
    const parsed = updateLanguageSettingsSchema.parse({ ...SETTINGS, audioRate: '0.85', audioPitch: '-10%' });
    assert.equal(parsed.audioRate, '0.85');
    assert.equal(parsed.audioPitch, '-10%');
  });

  it('writes a pitch typed without its sign or percent sign in full', () => {
    assert.equal(updateLanguageSettingsSchema.parse({ ...SETTINGS, audioPitch: '-10' }).audioPitch, '-10%');
    assert.equal(updateLanguageSettingsSchema.parse({ ...SETTINGS, audioPitch: '5' }).audioPitch, '+5%');
    assert.equal(updateLanguageSettingsSchema.parse({ ...SETTINGS, audioPitch: '+5%' }).audioPitch, '+5%');
  });

  it('reads pauses typed into the form as whole milliseconds', () => {
    const parsed = updateLanguageSettingsSchema.parse({ ...SETTINGS, audioSentencePauseMs: '800', audioCommaPauseMs: 150 });
    assert.equal(parsed.audioSentencePauseMs, 800);
    assert.equal(parsed.audioCommaPauseMs, 150);
  });

  it('reads a blank or absent pause as the voice default, and keeps a zero', () => {
    assert.equal(updateLanguageSettingsSchema.parse(SETTINGS).audioSentencePauseMs, null);
    assert.equal(updateLanguageSettingsSchema.parse({ ...SETTINGS, audioCommaPauseMs: ' ' }).audioCommaPauseMs, null);
    assert.equal(updateLanguageSettingsSchema.parse({ ...SETTINGS, audioCommaPauseMs: '0' }).audioCommaPauseMs, 0);
  });

  for (const pause of ['5001', '-1', '1.5', '800ms', 'long', 99999]) {
    it(`refuses the pause ${pause}`, () => {
      assert.throws(() => updateLanguageSettingsSchema.parse({ ...SETTINGS, audioSentencePauseMs: pause }));
    });
  }

  for (const audioRate of ['0.4', '2.5', 'slow', '-1', '85%']) {
    it(`refuses the rate ${audioRate}`, () => {
      assert.throws(() => updateLanguageSettingsSchema.parse({ ...SETTINGS, audioRate }));
    });
  }

  for (const audioPitch of ['-60%', '+51%', 'low', '10Hz']) {
    it(`refuses the pitch ${audioPitch}`, () => {
      assert.throws(() => updateLanguageSettingsSchema.parse({ ...SETTINGS, audioPitch }));
    });
  }

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

/**
 * What retuning a language does to the transcripts in it, against the seeded
 * database. The rule from #294: rate and pitch change what generation sends
 * from now on, and leave every hand-edited transcript where it was.
 */
import { after, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AudioProvider } from '@/generated/prisma/enums';
import prisma from '@/lib/db';
import { seededLanguage, seededVersion } from '../../../tests/seeded';
import { getTranscriptState, saveTranscript } from './audio.service';

const VOICE = 'sk-SK-LukasNeural';

after(() => prisma.$disconnect());

afterEach(async () => {
  const language = await seededLanguage('sk');
  await prisma.language.update({
    where: { id: language.id },
    data: { audioProvider: null, audioVoice: null, audioRate: null, audioPitch: null, audioSentencePauseMs: null, audioCommaPauseMs: null, audioQuality: null },
  });
  const version = await seededVersion('ex90-day-14', 'sk');
  await prisma.documentVersion.update({ where: { id: version.id }, data: { audioSsml: null, audioSsmlBase: null } });
});

async function slovakWithVoice(narration: {
  audioRate?: string | null;
  audioPitch?: string | null;
  audioSentencePauseMs?: number | null;
  audioCommaPauseMs?: number | null;
}) {
  const language = await seededLanguage('sk');
  await prisma.language.update({
    where: { id: language.id },
    data: { audioProvider: AudioProvider.AZURE_SPEECH, audioVoice: VOICE, ...narration },
  });
}

describe('retuning a language', () => {
  it('leaves a transcript edited before the change current', async () => {
    await slovakWithVoice({ audioRate: null, audioPitch: null });
    const version = await seededVersion('ex90-day-14', 'sk');
    assert.equal(await saveTranscript(version.id, '<speak>Rucne</speak>', null), true);
    assert.equal(await getTranscriptState(version.id), 'edited');

    await slovakWithVoice({ audioRate: '0.85', audioPitch: '-10%', audioSentencePauseMs: 800, audioCommaPauseMs: 150 });

    assert.equal(await getTranscriptState(version.id), 'edited');
  });

  it('leaves a transcript edited after the change current', async () => {
    await slovakWithVoice({ audioRate: '0.85', audioPitch: '-10%' });
    const version = await seededVersion('ex90-day-14', 'sk');
    await saveTranscript(version.id, '<speak>Rucne</speak>', null);

    await slovakWithVoice({ audioRate: null, audioPitch: null });

    assert.equal(await getTranscriptState(version.id), 'edited');
  });
});

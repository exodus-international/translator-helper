import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioProvider, AudioStatus, DocumentType, type AudioFile } from '@prisma/client';
import { createStartGeneration, type GenerationDeps, type VersionForGeneration } from './audio.service';
import type { SpeechProvider } from './providers/speech-provider';

/**
 * What reaches the speech provider, without a database, an Azure key or an S3
 * bucket. The one question these answer is which SSML gets spoken: the script
 * derived from the document, or the one someone wrote by hand.
 */

const VOICE = 'cs-CZ-AntoninNeural';

function versionFixture(overrides: Partial<VersionForGeneration> = {}): VersionForGeneration {
  return {
    id: 'version-1',
    content: '# Den 3\n\nDnes se budeme modlit.',
    audioSsml: null,
    version: 4,
    language: { code: 'cs', audioProvider: AudioProvider.AZURE_SPEECH, audioVoice: VOICE },
    document: {
      type: DocumentType.DAY,
      originalFilename: null,
      slug: 'day-03',
      sourceProject: { identifier: 'exodus90', audioDocumentTypes: [DocumentType.DAY] },
    },
    ...overrides,
  };
}

function audioFileFixture(): AudioFile {
  return {
    id: 'audio-1',
    documentVersionId: 'version-1',
    status: AudioStatus.PENDING,
    provider: AudioProvider.AZURE_SPEECH,
    voice: VOICE,
    sourceVersion: 4,
    providerJobId: null,
    objectKey: null,
    url: null,
    durationMs: null,
    sizeBytes: null,
    billedCharacters: null,
    errorMessage: null,
    triggeredByUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Captures what the provider was asked to say, and what was logged about it. */
function harness(version: VersionForGeneration) {
  const submitted: string[] = [];
  const logged: { action: string; details?: unknown }[] = [];

  const provider = {
    id: AudioProvider.AZURE_SPEECH,
    maxBreakMs: 20_000,
    isConfigured: () => true,
    submit: async ({ ssml }: { jobId: string; ssml: string }) => {
      submitted.push(ssml);
      return { kind: 'job' as const, jobId: 'job-1' };
    },
    poll: async () => ({ kind: 'running' as const }),
  } as unknown as SpeechProvider;

  const deps: GenerationDeps = {
    loadVersion: async () => version,
    storageConfigured: () => true,
    getProvider: () => provider,
    createAudioFile: async () => audioFileFixture(),
    setAudioFileJob: async () => audioFileFixture(),
    claimForProcessing: async () => true,
    markFailed: async () => audioFileFixture(),
    log: async (entry: { action: string; details?: unknown }) => {
      logged.push({ action: entry.action, details: entry.details });
      return undefined as never;
    },
    finish: async () => audioFileFixture(),
  };

  return { submitted, logged, start: createStartGeneration(deps) };
}

test('with no override, the provider is sent the script derived from the document', async () => {
  const { submitted, start } = harness(versionFixture());

  const outcome = await start('version-1', 'user-1');

  assert.equal(outcome.status, 'success');
  assert.equal(submitted.length, 1);
  assert.match(submitted[0], /Dnes se budeme modlit\./);
  assert.match(submitted[0], new RegExp(`name="${VOICE}"`));
});

test('with an override, the provider is sent exactly that, wrapper and voice included', async () => {
  const override =
    '<speak version="1.0" xml:lang="cs-CZ"><voice name="cs-CZ-JitkaNeural">Rucne napsany text.</voice></speak>';
  const { submitted, start } = harness(versionFixture({ audioSsml: override }));

  const outcome = await start('version-1', 'user-1');

  assert.equal(outcome.status, 'success');
  assert.equal(submitted[0], override);
  // The document's own words are not in there; the override replaced them.
  assert.doesNotMatch(submitted[0], /modlit/);
});

test('the activity log records which of the two produced a recording', async () => {
  const derived = harness(versionFixture());
  await derived.start('version-1', 'user-1');
  assert.deepEqual(derived.logged[0].details, {
    audioFileId: 'audio-1',
    voice: VOICE,
    ssmlSource: 'derived',
  });

  const edited = harness(versionFixture({ audioSsml: '<speak>Ahoj</speak>' }));
  await edited.start('version-1', 'user-1');
  assert.deepEqual(edited.logged[0].details, {
    audioFileId: 'audio-1',
    voice: VOICE,
    ssmlSource: 'override',
  });
});

// A document that is only an unread block has nothing to say, and Azure is
// billed for the attempt. An override is the author's own words, so it is
// theirs to send even when the document itself would strip to nothing.
test('an empty document is refused, unless someone wrote the audio text by hand', async () => {
  const empty = harness(versionFixture({ content: '<div data-read="false">jen na obrazovce</div>' }));
  const refused = await empty.start('version-1', 'user-1');
  assert.equal(refused.status, 'failed');
  assert.equal(empty.submitted.length, 0);

  const written = harness(
    versionFixture({ content: '<div data-read="false">jen na obrazovce</div>', audioSsml: '<speak>Ahoj</speak>' }),
  );
  const accepted = await written.start('version-1', 'user-1');
  assert.equal(accepted.status, 'success');
  assert.equal(written.submitted[0], '<speak>Ahoj</speak>');
});

test('a document whose project has the type turned off is skipped, not failed', async () => {
  const { submitted, start } = harness(
    versionFixture({
      document: {
        type: DocumentType.MEETING,
        originalFilename: 'meeting.md',
        slug: 'meeting',
        sourceProject: { identifier: 'exodus90', audioDocumentTypes: [DocumentType.DAY] },
      },
    }),
  );

  const outcome = await start('version-1', 'user-1');

  assert.equal(outcome.status, 'skipped');
  assert.equal(submitted.length, 0);
});

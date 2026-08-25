import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioProvider, DocumentType } from '@prisma/client';
import { audioSkipReason, formatAudioError, isAudioStale, parseAudioError } from './audio.rules';

test('audio generated from the current version is not stale', () => {
  assert.equal(isAudioStale({ sourceVersion: 4 }, { version: 4 }), false);
});

test('audio is stale once the document version counter moved past its source version', () => {
  assert.equal(isAudioStale({ sourceVersion: 4 }, { version: 5 }), true);
  assert.equal(isAudioStale({ sourceVersion: 1 }, { version: 9 }), true);
});

const eligible = {
  language: { audioProvider: AudioProvider.AZURE_SPEECH, audioVoice: 'cs-CZ-AntoninNeural' },
  document: { type: DocumentType.DAY, sourceProject: { audioDocumentTypes: [DocumentType.DAY, DocumentType.DAILY_CONTENT] } },
  storageConfigured: true,
  providerConfigured: () => true,
};

test('a fully configured version is eligible', () => {
  assert.equal(audioSkipReason(eligible), null);
});

test('a language without provider or voice is skipped', () => {
  assert.equal(audioSkipReason({ ...eligible, language: { audioProvider: null, audioVoice: null } }), 'no_voice_for_language');
  assert.equal(
    audioSkipReason({ ...eligible, language: { audioProvider: AudioProvider.AZURE_SPEECH, audioVoice: null } }),
    'no_voice_for_language',
  );
});

test('a document without a type is skipped', () => {
  assert.equal(audioSkipReason({ ...eligible, document: { ...eligible.document, type: null } }), 'document_type_missing');
});

test('a document type not enabled on the source project is skipped', () => {
  assert.equal(
    audioSkipReason({ ...eligible, document: { ...eligible.document, type: DocumentType.ROOT_FILE } }),
    'document_type_not_enabled',
  );
  assert.equal(
    audioSkipReason({ ...eligible, document: { type: DocumentType.DAY, sourceProject: null } }),
    'document_type_not_enabled',
  );
});

test('missing storage or provider configuration is reported after the content checks', () => {
  assert.equal(audioSkipReason({ ...eligible, storageConfigured: false }), 'storage_not_configured');
  assert.equal(audioSkipReason({ ...eligible, providerConfigured: () => false }), 'provider_not_configured');
});

test('error messages round-trip their kind', () => {
  assert.equal(formatAudioError('provider', 'Azure said no'), '[provider] Azure said no');
  assert.deepEqual(parseAudioError('[configuration] MEETING documents require an originalFilename'), {
    kind: 'configuration',
    message: 'MEETING documents require an originalFilename',
  });
  assert.deepEqual(parseAudioError('plain text'), { kind: 'unknown', message: 'plain text' });
  assert.deepEqual(parseAudioError(null), { kind: 'unknown', message: 'Unknown error' });
});

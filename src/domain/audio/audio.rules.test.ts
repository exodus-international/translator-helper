import assert from 'node:assert/strict';
import test from 'node:test';
import { AudioProvider, DocumentType } from '@prisma/client';
import {
  audioSkipReason,
  fingerprint,
  formatAudioError,
  isAudioStale,
  localeFromVoice,
  parseAudioError,
  resolveAudioSsml,
  transcriptBaseline,
  transcriptState,
} from './audio.rules';
import { deriveAudioSsml, hasReadableText } from './audio.service';

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

// ─── The transcript ──────────────────────────────────────────

const VOICE = 'cs-CZ-AntoninNeural';
const transcriptInput = { content: '# Den 3\n\nDnes se budeme modlit.', voice: VOICE, maxBreakMs: 20_000 };

test('a voice id gives up its locale', () => {
  assert.equal(localeFromVoice(VOICE), 'cs-CZ');
  assert.equal(localeFromVoice('sk-SK-LukasNeural'), 'sk-SK');
});

test('the derived SSML carries the voice, the locale and the words', () => {
  const ssml = deriveAudioSsml(transcriptInput);
  assert.match(ssml, /^<speak /);
  assert.match(ssml, /xml:lang="cs-CZ"/);
  assert.match(ssml, /name="cs-CZ-AntoninNeural"/);
  assert.match(ssml, /Dnes se budeme modlit\./);
  // Markdown syntax is the narrator's problem, not the listener's.
  assert.doesNotMatch(ssml, /#/);
});

test('with no override, the derived script is what gets spoken', () => {
  const resolved = resolveAudioSsml({ derive: () => deriveAudioSsml(transcriptInput) });
  assert.equal(resolved.source, 'derived');
  assert.equal(resolved.ssml, deriveAudioSsml(transcriptInput));
});

test('an override is sent verbatim, wrapper and all, and nothing is derived', () => {
  const override = '<speak version="1.0" xml:lang="cs-CZ"><voice name="cs-CZ-JitkaNeural">Ahoj</voice></speak>';
  const resolved = resolveAudioSsml({
    override,
    derive: () => assert.fail('deriving is wasted work when an override exists'),
  });
  assert.equal(resolved.source, 'override');
  assert.equal(resolved.ssml, override);
});

// A cleared editor stores an empty string rather than null; treating that as an
// override would send Azure nothing at all.
test('a blank override is no override', () => {
  const derive = () => deriveAudioSsml(transcriptInput);
  assert.equal(resolveAudioSsml({ override: '   \n', derive }).source, 'derived');
  assert.equal(resolveAudioSsml({ override: null, derive }).source, 'derived');
});

test('a document with nothing to read is recognised before anything is generated', () => {
  assert.equal(hasReadableText('# Den 3\n\nDnes se budeme modlit.'), true);
  assert.equal(hasReadableText('<div data-read="false">jen na obrazovce</div>'), false);
  assert.equal(hasReadableText('   '), false);
});

test('a transcript with nothing stored is the generated one', () => {
  assert.equal(transcriptState({ override: null }), 'generated');
  assert.equal(transcriptState({ override: '  ' }), 'generated');
  assert.equal(transcriptState({}), 'generated');
});

test('a stored override makes the transcript an edited one', () => {
  assert.equal(transcriptState({ override: '<speak>Ahoj</speak>' }), 'edited');
});

test('an edited transcript stays current while the spoken words do not change', () => {
  const derived = deriveAudioSsml(transcriptInput);
  const state = transcriptState({
    override: '<speak>Rucne</speak>',
    baseline: transcriptBaseline(derived),
    derived,
  });
  assert.equal(state, 'edited');
});

// Auto-save bumps the version counter every few seconds of typing, so the
// comparison is of what a narrator would read, not of version numbers.
test('an edited transcript goes out of date when the spoken words change', () => {
  const baseline = transcriptBaseline(deriveAudioSsml(transcriptInput));
  const afterEdit = deriveAudioSsml({ ...transcriptInput, content: '# Den 3\n\nDnes se budeme postit.' });

  assert.equal(
    transcriptState({ override: '<speak>Rucne</speak>', baseline, derived: afterEdit }),
    'edited_outdated',
  );
});

test('a Markdown-only change leaves an edited transcript alone', () => {
  const baseline = transcriptBaseline(deriveAudioSsml(transcriptInput));
  // Bolding a word and adding frontmatter: same words, same pauses.
  const cosmetic = deriveAudioSsml({
    ...transcriptInput,
    content: '---\nday: 3\n---\n\n# Den 3\n\nDnes se budeme **modlit**.',
  });

  assert.equal(transcriptState({ override: '<speak>Rucne</speak>', baseline, derived: cosmetic }), 'edited');
});

test('a document with no override is never out of date', () => {
  assert.equal(transcriptState({ override: null, baseline: 'stale', derived: 'anything' }), 'generated');
});

test('a fingerprint is stable for the same text and differs for different text', () => {
  assert.equal(fingerprint('<speak>Ahoj</speak>'), fingerprint('<speak>Ahoj</speak>'));
  assert.notEqual(fingerprint('<speak>Ahoj</speak>'), fingerprint('<speak>Nazdar</speak>'));
});

// The transcript editor shows formatted SSML, so the layout of what is derived
// can change without a word of it changing. The baseline must not notice.
test('reindenting the derived SSML does not put an edited transcript out of date', () => {
  const derived = deriveAudioSsml(transcriptInput);
  const compact = derived.replace(/>\s+</g, '><');

  assert.equal(transcriptBaseline(derived), transcriptBaseline(compact));
  assert.equal(
    transcriptState({ override: '<speak>Rucne</speak>', baseline: transcriptBaseline(compact), derived }),
    'edited',
  );
});

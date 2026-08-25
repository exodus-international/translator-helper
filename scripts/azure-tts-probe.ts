/**
 * Probe for Azure Speech batch synthesis (issue #109).
 *
 * Reads a Markdown file, builds SSML through the same pure modules the app
 * will use, submits a batch synthesis job, waits for it, unzips the result
 * and writes the MP3 next to the reported duration, size and billed
 * characters.
 *
 * Usage:
 *   pnpm tsx scripts/azure-tts-probe.ts --file path/to/day.md [--voice cs-CZ-AntoninNeural] [--locale cs-CZ] [--out out.mp3]
 *
 * Env (read from .env.local if present):
 *   AZURE_SPEECH_RESOURCE  resource name, i.e. the host is {resource}.cognitiveservices.azure.com
 *   AZURE_SPEECH_KEY       subscription key
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { unzipSync } from 'fflate';
import { markdownToSpeechScript } from '../src/domain/audio/audio.script';
import { speechScriptToSsml } from '../src/domain/audio/audio.ssml';

const API_VERSION = '2024-04-01';
const OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';
const MAX_BREAK_MS = 20_000;

loadEnvFile('.env.local');

const args = parseArgs(process.argv.slice(2));
const file = args.file;
if (!file) fail('Missing --file <markdown>');
const voice = args.voice ?? 'cs-CZ-AntoninNeural';
const locale = args.locale ?? voice.split('-').slice(0, 2).join('-');
const out = args.out ?? file.replace(/\.md$/i, '') + '.mp3';

const resource = process.env.AZURE_SPEECH_RESOURCE;
const key = process.env.AZURE_SPEECH_KEY;
if (!resource || !key) fail('Set AZURE_SPEECH_RESOURCE and AZURE_SPEECH_KEY');

const base = `https://${resource}.cognitiveservices.azure.com/texttospeech/batchsyntheses`;
const headers = { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': 'application/json' };

async function main() {
  const markdown = readFileSync(file!, 'utf8');
  const script = markdownToSpeechScript(markdown);
  const ssml = speechScriptToSsml(script, { voice, locale, maxBreakMs: MAX_BREAK_MS });

  const pauses = script.segments.filter((s) => s.kind === 'pause');
  const spoken = script.segments
    .filter((s): s is { kind: 'text'; text: string } => s.kind === 'text')
    .reduce((n, s) => n + s.text.length, 0);
  console.log(`segments: ${script.segments.length}, pauses: ${pauses.length}, spoken chars: ${spoken}`);
  console.log(`voice: ${voice}, locale: ${locale}`);

  const jobId = `probe-${randomUUID()}`;
  const created = await fetch(`${base}/${jobId}?api-version=${API_VERSION}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      inputKind: 'SSML',
      inputs: [{ content: ssml }],
      properties: { outputFormat: OUTPUT_FORMAT, wordBoundaryEnabled: false, sentenceBoundaryEnabled: false },
    }),
  });
  if (!created.ok) fail(`create failed: ${created.status} ${await created.text()}`);
  console.log(`job ${jobId} submitted`);

  const startedAt = Date.now();
  let job: JobResponse;
  for (;;) {
    await sleep(5000);
    const res = await fetch(`${base}/${jobId}?api-version=${API_VERSION}`, { headers });
    if (!res.ok) fail(`poll failed: ${res.status} ${await res.text()}`);
    job = (await res.json()) as JobResponse;
    console.log(`  ${job.status} (${Math.round((Date.now() - startedAt) / 1000)}s)`);
    if (job.status === 'Succeeded' || job.status === 'Failed') break;
  }

  if (job.status === 'Failed') fail(`job failed: ${JSON.stringify(job.properties?.error ?? job, null, 2)}`);
  const resultUrl = job.outputs?.result;
  if (!resultUrl) fail('job succeeded but has no outputs.result');

  const zip = await fetch(resultUrl, { headers: { 'Ocp-Apim-Subscription-Key': key! } });
  if (!zip.ok) fail(`download failed: ${zip.status}`);
  const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
  const audioName = Object.keys(entries).find((n) => /\.(mp3|wav)$/i.test(n));
  if (!audioName) fail(`no audio in zip; entries: ${Object.keys(entries).join(', ')}`);
  writeFileSync(out, entries[audioName!]);

  const p = job.properties ?? {};
  console.log(`\nwrote ${out} (${entries[audioName!].byteLength} bytes)`);
  console.log(`durationInMilliseconds: ${p.durationInMilliseconds}`);
  console.log(`sizeInBytes: ${p.sizeInBytes}`);
  console.log(`billingDetails.neuralCharacters: ${p.billingDetails?.neuralCharacters}`);
  console.log(`expected silence from markers: ${pauses.reduce((n, s) => n + (s.kind === 'pause' ? s.seconds : 0), 0)}s`);

  await fetch(`${base}/${jobId}?api-version=${API_VERSION}`, { method: 'DELETE', headers });
}

interface JobResponse {
  status: 'NotStarted' | 'Running' | 'Succeeded' | 'Failed';
  outputs?: { result?: string };
  properties?: {
    durationInMilliseconds?: number;
    sizeInBytes?: number;
    billingDetails?: { neuralCharacters?: number };
    error?: unknown;
  };
}

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) result[argv[i].slice(2)] = argv[i + 1] ?? '';
  }
  return result;
}

function loadEnvFile(path: string) {
  try {
    process.loadEnvFile?.(path);
  } catch {
    // no .env.local, rely on the environment
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

main().catch((error) => fail(String(error)));

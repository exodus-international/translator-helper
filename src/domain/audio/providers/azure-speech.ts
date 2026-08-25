import { AudioProvider } from '@prisma/client';
import { unzipSync } from 'fflate';
import { getAzureSpeechConfig, isAzureSpeechConfigured } from '@/lib/azure-speech-config';
import type { PollOutcome, SpeechProvider, SubmitOutcome, SynthesisRequest, SynthesisResult } from './speech-provider';

/**
 * Azure Speech batch synthesis. Chosen over the real-time endpoint because
 * that one silently truncates at ten minutes of audio (see #107).
 *
 * The result of a job is a ZIP containing the audio plus summary/debug
 * files; this module unpacks it so nothing outside knows.
 */

const API_VERSION = '2024-04-01';
const OUTPUT_FORMAT = 'audio-24khz-96kbitrate-mono-mp3';
const LOG_PREFIX = '[AzureSpeech]';

interface BatchJob {
  status: 'NotStarted' | 'Running' | 'Succeeded' | 'Failed';
  outputs?: { result?: string };
  properties?: {
    durationInMilliseconds?: number;
    sizeInBytes?: number;
    billingDetails?: { neuralCharacters?: number };
    error?: { code?: string; message?: string };
  };
}

function baseUrl() {
  return `https://${getAzureSpeechConfig().resource}.cognitiveservices.azure.com/texttospeech/batchsyntheses`;
}

function authHeaders(): Record<string, string> {
  return { 'Ocp-Apim-Subscription-Key': getAzureSpeechConfig().key };
}

export const azureSpeechProvider: SpeechProvider = {
  id: AudioProvider.AZURE_SPEECH,
  maxBreakMs: 20_000,
  isConfigured: isAzureSpeechConfigured,

  async submit(request: SynthesisRequest): Promise<SubmitOutcome> {
    const res = await fetch(`${baseUrl()}/${request.jobId}?api-version=${API_VERSION}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputKind: 'SSML',
        inputs: [{ content: request.ssml }],
        properties: { outputFormat: OUTPUT_FORMAT, wordBoundaryEnabled: false, sentenceBoundaryEnabled: false },
      }),
    });

    // 409: a job with this id already exists, which is the retry case the
    // caller-chosen id is there for. Poll it instead of creating a duplicate.
    if (res.status === 409) {
      console.log(`${LOG_PREFIX} job ${request.jobId} already exists, reusing`);
      return { kind: 'job', jobId: request.jobId };
    }
    if (!res.ok) {
      throw new Error(`Azure batch synthesis create failed (${res.status}): ${await safeText(res)}`);
    }
    return { kind: 'job', jobId: request.jobId };
  },

  async poll(jobId: string): Promise<PollOutcome> {
    const res = await fetch(`${baseUrl()}/${jobId}?api-version=${API_VERSION}`, { headers: authHeaders() });
    if (!res.ok) {
      throw new Error(`Azure batch synthesis poll failed (${res.status}): ${await safeText(res)}`);
    }
    const job = (await res.json()) as BatchJob;

    if (job.status === 'Failed') {
      const error = job.properties?.error;
      return { kind: 'failed', message: error?.message ?? error?.code ?? 'Azure reported the job as failed' };
    }
    if (job.status !== 'Succeeded') return { kind: 'running' };

    const resultUrl = job.outputs?.result;
    if (!resultUrl) return { kind: 'failed', message: 'Azure job succeeded but returned no result file' };

    const result = await downloadResult(resultUrl, job);
    // Best effort: the result is ours now, Azure's copy can go.
    void fetch(`${baseUrl()}/${jobId}?api-version=${API_VERSION}`, { method: 'DELETE', headers: authHeaders() }).catch(
      () => undefined,
    );
    return { kind: 'succeeded', result };
  },
};

async function downloadResult(resultUrl: string, job: BatchJob): Promise<SynthesisResult> {
  const res = await fetch(resultUrl, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Azure result download failed (${res.status})`);

  const entries = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const audioName = Object.keys(entries).find((name) => /\.mp3$/i.test(name));
  if (!audioName) {
    throw new Error(`Azure result ZIP contains no MP3 (entries: ${Object.keys(entries).join(', ')})`);
  }

  const props = job.properties ?? {};
  return {
    audio: entries[audioName],
    contentType: 'audio/mpeg',
    durationMs: props.durationInMilliseconds,
    sizeBytes: props.sizeInBytes ?? entries[audioName].byteLength,
    billedCharacters: props.billingDetails?.neuralCharacters,
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '';
  }
}

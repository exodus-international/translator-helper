'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Copy, Download, Loader2, RefreshCw, Volume2 } from 'lucide-react';
import { advanceAudioJobAction, getLatestAudioFileAction, regenerateAudioAction } from '@/domain/audio/audio.actions';
import { isAudioStale, parseAudioError } from '@/domain/audio/audio.rules';
import { AUDIO_SKIP_MESSAGES, type AudioFileView } from '@/domain/audio/audio.types';
import { DocumentStatus } from '@prisma/client';
import { toast } from 'sonner';

interface AudioStatusProps {
  documentVersionId: string;
  /** DocumentVersion.version, compared with the audio's sourceVersion for staleness. */
  currentVersion: number;
  status: DocumentStatus;
}

const POLL_INTERVAL_MS = 5000;

const isInFlight = (audio: AudioFileView | null) => audio?.status === 'PENDING' || audio?.status === 'PROCESSING';

/**
 * Sidebar card for the generated audio of a document version. Polls while a
 * generation is in flight. Offers regenerate/retry to whoever may edit the
 * version (the server action enforces that; here the button is just shown).
 */
export function AudioStatus({ documentVersionId, currentVersion, status }: AudioStatusProps) {
  const [audio, setAudio] = useState<AudioFileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setAudio(await getLatestAudioFileAction(documentVersionId));
    } catch (error) {
      console.error('[AudioStatus] Error loading audio:', error);
    } finally {
      setLoading(false);
    }
  }, [documentVersionId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    if (!isInFlight(audio)) return;
    const id = audio!.id;
    timer.current = setTimeout(async () => {
      try {
        const next = await advanceAudioJobAction(id);
        if (next) setAudio(next);
      } catch (error) {
        console.error('[AudioStatus] Error advancing job:', error);
      }
    }, POLL_INTERVAL_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [audio]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const outcome = await regenerateAudioAction(documentVersionId);
      if (outcome.status === 'skipped') {
        toast.warning(`Audio skipped: ${AUDIO_SKIP_MESSAGES[outcome.reason]}`);
      } else if (outcome.status === 'failed') {
        toast.error(outcome.error);
      } else {
        toast.success('Audio generation started');
      }
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not start audio generation');
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!audio?.url) return;
    try {
      await navigator.clipboard.writeText(audio.url);
      toast.success('Audio URL copied');
    } catch {
      toast.error('Could not copy the URL');
    }
  };

  if (loading) return null;

  // Nothing generated yet: offer a manual start only once the text is approved.
  const approvedOrLater = status === DocumentStatus.APPROVED || status === DocumentStatus.DEPLOYED;
  if (!audio && !approvedOrLater) return null;

  const stale = audio ? isAudioStale(audio, { version: currentVersion }) : false;
  const error = audio?.status === 'FAILED' ? parseAudioError(audio.errorMessage) : null;

  return (
    <Card className="mt-4 p-4">
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Volume2 className="h-5 w-5" />
        Audio
        {stale && (
          <Badge className="bg-amber-100 text-amber-800" title="The text changed after this audio was generated">
            Stale
          </Badge>
        )}
      </h3>

      {!audio && (
        <div className="text-sm text-gray-500">
          <p>No audio has been generated for this version.</p>
          <RegenerateButton label="Generate audio" busy={regenerating} onClick={handleRegenerate} />
        </div>
      )}

      {audio && isInFlight(audio) && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating audio with {audio.voice}...
        </div>
      )}

      {audio && error && (
        <div className="flex items-start gap-2 text-red-600">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{errorTitle(error.kind)}</p>
            <p className="text-sm break-words">{error.message}</p>
            {error.kind === 'configuration' && (
              <p className="text-xs text-gray-500 mt-1">Retrying will not help until the configuration is fixed.</p>
            )}
            <RegenerateButton label="Retry" busy={regenerating} onClick={handleRegenerate} />
          </div>
        </div>
      )}

      {audio && audio.status === 'READY' && audio.url && (
        <div className="space-y-3">
          <audio controls preload="none" src={audio.url} className="w-full" />
          <div className="text-xs text-gray-500">
            {audio.voice}
            {audio.durationMs ? ` · ${formatDuration(audio.durationMs)}` : ''}
            {audio.sizeBytes ? ` · ${(audio.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}
          </div>
          <div className="text-xs text-gray-500">
            Generated {formatDate(audio.updatedAt)} from version {audio.sourceVersion}
            {stale ? ` (text is now at version ${currentVersion})` : ''}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={audio.url} download target="_blank" rel="noopener noreferrer">
                <Download className="h-3 w-3 mr-1" />
                Download
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyUrl}>
              <Copy className="h-3 w-3 mr-1" />
              Copy URL
            </Button>
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating}>
              <RefreshCw className={`h-3 w-3 mr-1 ${regenerating ? 'animate-spin' : ''}`} />
              {regenerating ? 'Starting...' : 'Regenerate'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function RegenerateButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" className="mt-2" onClick={onClick} disabled={busy}>
      <RefreshCw className={`h-3 w-3 mr-1 ${busy ? 'animate-spin' : ''}`} />
      {busy ? 'Starting...' : label}
    </Button>
  );
}

function errorTitle(kind: ReturnType<typeof parseAudioError>['kind']): string {
  switch (kind) {
    case 'configuration':
      return 'Audio generation failed: configuration problem';
    case 'content':
      return 'Audio generation failed: nothing to read';
    case 'provider':
      return 'Audio generation failed: speech service error';
    default:
      return 'Audio generation failed';
  }
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

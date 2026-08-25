'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { SidebarSection } from '@/components/sidebar-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, Copy, Download, Loader2, Pause, Play, RefreshCw, Volume2 } from 'lucide-react';
import { advanceAudioJobAction, getLatestAudioFileAction, regenerateAudioAction } from '@/domain/audio/audio.actions';
import { isAudioStale, parseAudioError } from '@/domain/audio/audio.rules';
import { AUDIO_SKIP_MESSAGES, type AudioFileView } from '@/domain/audio/audio.types';
import { capture } from '@/lib/analytics';
import { DocumentStatus } from '@prisma/client';
import { toast } from 'sonner';

interface AudioStatusProps {
  documentVersionId: string;
  /** DocumentVersion.version, compared with the audio's sourceVersion for staleness. */
  currentVersion: number;
  status: DocumentStatus;
  /** One-line summary row for the sidebar instead of the full card. */
  compact?: boolean;
  /** `section` renders in the flat sidebar frame; `card` is the standalone card. */
  frame?: 'card' | 'section';
}

const POLL_INTERVAL_MS = 5000;

const isInFlight = (audio: AudioFileView | null) => audio?.status === 'PENDING' || audio?.status === 'PROCESSING';

/**
 * Sidebar card for the generated audio of a document version. Polls while a
 * generation is in flight. Offers regenerate/retry to whoever may edit the
 * version (the server action enforces that; here the button is just shown).
 */
export function AudioStatus({
  documentVersionId,
  currentVersion,
  status,
  compact = false,
  frame = 'card',
}: AudioStatusProps) {
  const [audio, setAudio] = useState<AudioFileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [fileMissing, setFileMissing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackTracked = useRef(false);
  const failureTracked = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFileMissing(false);
    try {
      setAudio(await getLatestAudioFileAction(documentVersionId));
    } catch (error) {
      console.error('[AudioStatus] Error loading audio:', error);
    } finally {
      setLoading(false);
    }
  }, [documentVersionId]);

  useEffect(() => {
    load();
  }, [load]);

  // The record says READY but storage may have lost the object (a bucket
  // lifecycle rule, a manual delete). The browser is the only one that can
  // tell us, so ask it: try to fetch the first byte.
  useEffect(() => {
    if (audio?.status !== 'READY' || !audio.url) return;
    let cancelled = false;
    fetch(audio.url, { method: 'GET', headers: { Range: 'bytes=0-0' }, mode: 'cors' })
      .then((res) => {
        if (!cancelled && (res.status === 404 || res.status === 403)) setFileMissing(true);
      })
      .catch(() => {
        // CORS-opaque or network failure: cannot tell, assume present and let the player report.
      });
    return () => {
      cancelled = true;
    };
  }, [audio?.status, audio?.url]);

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

  useEffect(() => {
    if (audio?.status === 'FAILED' && failureTracked.current !== audio.id) {
      failureTracked.current = audio.id;
      capture('audio_generation_failed', { documentVersionId, kind: parseAudioError(audio.errorMessage).kind });
    }
  }, [audio, documentVersionId]);

  const handleRegenerate = async (reason: 'regenerate' | 'retry' | 'generate') => {
    setRegenerating(true);
    try {
      const outcome = await regenerateAudioAction(documentVersionId);
      capture('audio_regeneration_triggered', { documentVersionId, reason });
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
      capture('audio_url_copied', { documentVersionId });
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

  if (compact) {
    return <AudioSummaryRow audio={audio} stale={stale} fileMissing={fileMissing} documentVersionId={documentVersionId} />;
  }

  const staleBadge = stale ? (
    <Badge className="bg-amber-100 text-amber-800" title="The text changed after this audio was generated">
      Stale
    </Badge>
  ) : null;

  const body = (
    <>

      {!audio && (
        <div className="text-sm text-gray-500">
          <p>No audio has been generated for this version.</p>
          <RegenerateButton label="Generate audio" busy={regenerating} onClick={() => handleRegenerate('generate')} />
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
            <RegenerateButton label="Retry" busy={regenerating} onClick={() => handleRegenerate('retry')} />
          </div>
        </div>
      )}

      {audio && audio.status === 'READY' && fileMissing && (
        <div className="flex items-start gap-2 text-amber-700">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">Audio file is no longer in storage</p>
            <p className="text-sm">
              It was generated {formatDate(audio.updatedAt)} from version {audio.sourceVersion} but the file has since been
              removed. Regenerate to get a new one.
            </p>
            <RegenerateButton label="Regenerate" busy={regenerating} onClick={() => handleRegenerate('regenerate')} />
          </div>
        </div>
      )}

      {audio && audio.status === 'READY' && !fileMissing && audio.url && (
        <div className="space-y-3">
          <audio
            controls
            preload="none"
            src={audio.url}
            onError={() => setFileMissing(true)}
            className="w-full"
            onPlay={() => {
              if (playbackTracked.current) return;
              playbackTracked.current = true;
              capture('audio_playback_started', { documentVersionId, provider: audio.provider, voice: audio.voice });
            }}
          />
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
            <Button variant="outline" size="sm" onClick={() => handleRegenerate('regenerate')} disabled={regenerating}>
              <RefreshCw className={`h-3 w-3 mr-1 ${regenerating ? 'animate-spin' : ''}`} />
              {regenerating ? 'Starting...' : 'Regenerate'}
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (frame === 'section') {
    return (
      <SidebarSection title="Audio" action={staleBadge}>
        {body}
      </SidebarSection>
    );
  }

  return (
    <Card className="mt-4 p-4">
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Volume2 className="h-5 w-5" />
        Audio
        {staleBadge}
      </h3>
      {body}
    </Card>
  );
}

/** Sidebar row: state at a glance plus a play/pause toggle when there is something to hear. */
function AudioSummaryRow({
  audio,
  stale,
  fileMissing,
  documentVersionId,
}: {
  audio: AudioFileView | null;
  stale: boolean;
  fileMissing: boolean;
  documentVersionId: string;
}) {
  const player = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const tracked = useRef(false);

  const toggle = () => {
    const el = player.current;
    if (!el) return;
    if (el.paused) {
      el.play();
      if (!tracked.current && audio) {
        tracked.current = true;
        capture('audio_playback_started', { documentVersionId, provider: audio.provider, voice: audio.voice });
      }
    } else {
      el.pause();
    }
  };

  let label: string;
  let tone = 'text-muted-foreground';
  if (!audio) label = 'Not generated';
  else if (isInFlight(audio)) label = 'Generating...';
  else if (audio.status === 'FAILED') {
    label = 'Failed';
    tone = 'text-red-600';
  } else if (fileMissing) {
    label = 'File removed';
    tone = 'text-amber-700';
  } else {
    label = audio.durationMs ? formatDuration(audio.durationMs) : 'Ready';
    if (stale) {
      label += ' · stale';
      tone = 'text-amber-700';
    }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Volume2 className="h-3.5 w-3.5" />
        Audio
      </span>
      <span className={`flex items-center gap-1.5 text-xs font-medium ${tone}`}>
        {audio && isInFlight(audio) && <Loader2 className="h-3 w-3 animate-spin" />}
        {label}
        {audio?.status === 'READY' && !fileMissing && audio.url && (
          <>
            <audio
              ref={player}
              preload="none"
              src={audio.url}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={toggle} title={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
          </>
        )}
      </span>
    </div>
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

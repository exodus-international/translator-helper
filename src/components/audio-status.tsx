'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Copy, Download, Loader2, Volume2 } from 'lucide-react';
import { advanceAudioJobAction, getLatestAudioFileAction } from '@/domain/audio/audio.actions';
import type { AudioFileView } from '@/domain/audio/audio.types';
import { toast } from 'sonner';

interface AudioStatusProps {
  documentVersionId: string;
}

const POLL_INTERVAL_MS = 5000;

const isInFlight = (audio: AudioFileView | null) => audio?.status === 'PENDING' || audio?.status === 'PROCESSING';

/**
 * Sidebar card for the generated audio of a document version. Renders
 * nothing until a generation exists; polls while one is in flight.
 */
export function AudioStatus({ documentVersionId }: AudioStatusProps) {
  const [audio, setAudio] = useState<AudioFileView | null>(null);
  const [loading, setLoading] = useState(true);
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

  const handleCopyUrl = async () => {
    if (!audio?.url) return;
    try {
      await navigator.clipboard.writeText(audio.url);
      toast.success('Audio URL copied');
    } catch {
      toast.error('Could not copy the URL');
    }
  };

  if (loading || !audio) return null;

  return (
    <Card className="mt-4 p-4">
      <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <Volume2 className="h-5 w-5" />
        Audio
      </h3>

      {isInFlight(audio) && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Generating audio with {audio.voice}...
        </div>
      )}

      {audio.status === 'FAILED' && (
        <div className="flex items-start gap-2 text-red-600">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Audio generation failed</p>
            <p className="text-sm break-words">{audio.errorMessage ?? 'Unknown error'}</p>
          </div>
        </div>
      )}

      {audio.status === 'READY' && audio.url && (
        <div className="space-y-3">
          <audio controls preload="none" src={audio.url} className="w-full" />
          <div className="text-xs text-gray-500">
            {audio.voice}
            {audio.durationMs ? ` · ${formatDuration(audio.durationMs)}` : ''}
            {audio.sizeBytes ? ` · ${(audio.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ''}
          </div>
          <div className="flex gap-2">
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
          </div>
        </div>
      )}
    </Card>
  );
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

'use client';

import { UserAvatar } from '@/components/user-avatar';
import { Button } from '@/components/ui/button';
import { AVATAR_DIMENSION, AVATAR_MAX_BYTES, avatarRejectionReason } from '@/domain/user/user.avatar';
import { removeAvatarAction, uploadAvatarAction } from '@/domain/user/user.actions';
import { capture } from '@/lib/analytics';
import { cropToSquareImage } from '@/lib/image-crop';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const ACCEPTED = 'image/jpeg,image/png,image/webp';

interface AvatarUploaderProps {
  name: string;
  image: string | null;
  /** Used to look up a Gravatar while there is no uploaded picture. */
  email: string;
  /** False when the deployment has no object storage; the controls explain why. */
  enabled: boolean;
}

export function AvatarUploader({ name, image, email, enabled }: AvatarUploaderProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'uploading' | 'removing' | null>(null);
  const [current, setCurrent] = useState(image);
  const [preview, setPreview] = useState<string | null>(null);

  // The picture the server knows about wins whenever the page is refreshed:
  // once it arrives, the local stand-in is dropped (and revoked by the effect
  // below).
  useEffect(() => {
    setCurrent(image);
    setPreview(null);
  }, [image]);

  // A local preview is only a stand-in until the upload lands; revoking it
  // when it is replaced keeps the object URLs from piling up.
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview]);

  const handleFile = async (file: File) => {
    setBusy('uploading');
    let localPreview: string | null = null;
    try {
      const square = await cropToSquareImage(file, AVATAR_DIMENSION);

      const rejection = avatarRejectionReason({ contentType: square.type, size: square.size });
      if (rejection) throw new Error(rejection);

      localPreview = URL.createObjectURL(square);
      setPreview(localPreview);

      const formData = new FormData();
      formData.append('avatar', square);
      const url = await uploadAvatarAction(formData);

      setCurrent(url);
      capture('avatar_uploaded');
      toast.success('Profile picture updated');
      router.refresh();
    } catch (error) {
      if (localPreview) {
        URL.revokeObjectURL(localPreview);
        setPreview(null);
      }
      toast.error(error instanceof Error ? error.message : 'Failed to upload picture');
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async () => {
    setBusy('removing');
    try {
      await removeAvatarAction();
      setCurrent(null);
      setPreview(null);
      capture('avatar_removed');
      toast.success('Profile picture removed');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove picture');
    } finally {
      setBusy(null);
    }
  };

  const shown = preview ?? current;
  const uploading = busy === 'uploading';

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative">
        <UserAvatar
          name={name}
          image={shown}
          email={email}
          size="2xl"
          className="ring-4 ring-background shadow-sm"
          eager
        />
        {enabled && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy !== null}
            aria-label={shown ? 'Change profile picture' : 'Upload a profile picture'}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-100"
          >
            {uploading ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
          </button>
        )}
      </div>

      <div className="flex flex-col items-center gap-2 sm:items-start">
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!enabled || busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
            {shown ? 'Change picture' : 'Upload picture'}
          </Button>
          {shown && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!enabled || busy !== null}
              onClick={handleRemove}
              className="text-muted-foreground hover:text-destructive"
            >
              {busy === 'removing' ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Remove
            </Button>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground sm:text-left">
          {enabled
            ? `JPEG, PNG or WebP. Cropped to a square and resized to ${AVATAR_DIMENSION}px, so anything up to ${Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB works.`
            : 'Picture uploads are unavailable: this deployment has no image storage configured.'}
        </p>
        {!shown && (
          <p className="text-center text-xs text-muted-foreground sm:text-left">
            Until you upload one we show your Gravatar, if the address above has one.
          </p>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset first, so picking the same file twice still fires a change.
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />
    </div>
  );
}

'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface OriginalFilenameFieldProps {
  value: string;
  onChange: (value: string) => void;
  documentType: string;
  error: string | null;
}

export function OriginalFilenameField({ value, onChange, documentType, error }: OriginalFilenameFieldProps) {
  return (
    <div>
      <Label htmlFor="originalFilename">Original Filename</Label>
      <Input
        id="originalFilename"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          documentType === 'DAILY_CONTENT'
            ? 'e.g., 20260201-5.md'
            : documentType === 'MEETING'
              ? 'e.g., 1-7.md'
              : 'e.g., 1.md'
        }
        className={error ? 'border-red-500' : ''}
      />
      {error ? (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      ) : (
        <p className="text-xs text-gray-500 mt-1">Used for GitHub deploy path</p>
      )}
    </div>
  );
}

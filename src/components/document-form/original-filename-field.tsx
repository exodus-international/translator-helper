'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function filenamePlaceholder(documentType: string): string {
  switch (documentType) {
    case 'DAILY_CONTENT':
      return 'e.g., 20260201-5.md';
    case 'MEETING':
      return 'e.g., 1-6.md';
    case 'ROOT_FILE':
      return 'e.g., description.md';
    default:
      return 'e.g., 1.md';
  }
}

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
        placeholder={filenamePlaceholder(documentType)}
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

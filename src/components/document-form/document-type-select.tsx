'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DOCUMENT_TYPE_CONFIGS, DOCUMENT_TYPE_SEQUENCE } from '@/constants/document-type';

interface DocumentTypeSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function DocumentTypeSelect({ value, onChange }: DocumentTypeSelectProps) {
  return (
    <div>
      <Label htmlFor="documentType">Document Type</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select type (optional)" />
        </SelectTrigger>
        <SelectContent>
          {DOCUMENT_TYPE_SEQUENCE.map((type) => (
            <SelectItem key={type} value={type}>
              {DOCUMENT_TYPE_CONFIGS[type].name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

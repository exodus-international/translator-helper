'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
          <SelectItem value="DAY">Day</SelectItem>
          <SelectItem value="FIELD_GUIDE">Field Guide</SelectItem>
          <SelectItem value="DAILY_CONTENT">Daily Content</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

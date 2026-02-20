'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import { useState } from 'react';

interface LabelsFieldProps {
  labels: string[];
  onChange: (labels: string[]) => void;
}

export function LabelsField({ labels, onChange }: LabelsFieldProps) {
  const [labelInput, setLabelInput] = useState('');

  const addLabel = () => {
    if (labelInput && !labels.includes(labelInput)) {
      onChange([...labels, labelInput]);
      setLabelInput('');
    }
  };

  const removeLabel = (label: string) => {
    onChange(labels.filter((l) => l !== label));
  };

  return (
    <div>
      <Label htmlFor="labels">Labels</Label>
      <div className="flex gap-2">
        <Input
          id="labels"
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          placeholder="Add label"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addLabel();
            }
          }}
        />
        <Button type="button" onClick={addLabel} variant="outline">
          Add
        </Button>
      </div>
      {labels.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {labels.map((label) => (
            <Badge key={label} variant="secondary">
              {label}
              <button type="button" onClick={() => removeLabel(label)} className="ml-2">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

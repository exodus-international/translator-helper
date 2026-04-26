'use client';

import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

export function DocumentSearchInput({
  value,
  onChange,
  placeholder = 'Search documents...',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex-1">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
      </div>
    </div>
  );
}

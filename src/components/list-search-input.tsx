'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { SearchIcon, XIcon } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';

interface ListSearchInputProps {
  /** Current search text from the URL (?q=). */
  value: string;
  /** Called with the debounced query. The caller resets to page 1. */
  onSearch: (query: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  id?: string;
}

/**
 * Reusable debounced search input for list pages. Types locally for instant
 * feedback, notifies the parent after `debounceMs` (default 300ms, per
 * issue #51). Follows the shadcn InputGroup composition: InputGroup >
 * InputGroupAddon + InputGroupInput, with the clear action as an
 * InputGroupButton inside the trailing addon.
 */
export function ListSearchInput({
  value,
  onSearch,
  placeholder = 'Search…',
  debounceMs = 300,
  className,
  id,
}: ListSearchInputProps) {
  const [text, setText] = useState(value);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const onSearchRef = useRef(onSearch);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  // Back/forward navigation or an external reset changes the URL value —
  // mirror it back into the field.
  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    // Compare trimmed: the parent receives the trimmed query, so an
    // untrimmed-but-equal field (e.g. trailing space) must not re-fire.
    if (text.trim() === value) return;
    const timer = window.setTimeout(() => {
      onSearchRef.current(text.trim());
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [text, value, debounceMs]);

  return (
    <InputGroup className={cn('max-w-md', className)}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput
        id={inputId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        type="search"
        aria-label={placeholder}
      />
      {text !== '' && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label="Clear search"
            onClick={() => {
              setText('');
              onSearchRef.current('');
            }}
          >
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}

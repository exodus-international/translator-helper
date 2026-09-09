'use client';

import { loader } from '@monaco-editor/react';

// Point the Monaco AMD loader at the self-hosted bundle vendored by
// scripts/copy-monaco.mjs (public/monaco/vs) instead of the jsdelivr CDN
// default. Import for the side effect before any <Editor>/<DiffEditor> mounts.
loader.config({ paths: { vs: '/monaco/vs' } });

export {};

"use client";

import { cn } from "@/lib/utils";
import Editor from "@monaco-editor/react";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

interface TextareaWithLineNumbersProps {
  value: string;
  onChange?: (value: string) => void;
  onCursorChange?: (lineNumber: number) => void;
  readOnly?: boolean;
  placeholder?: string;
  rows?: number;
  className?: string;
  currentLine?: number;
  highlightLine?: number; // Line to highlight from external source
}

export const TextareaWithLineNumbers = forwardRef<any, TextareaWithLineNumbersProps>(
  function TextareaWithLineNumbers({
    value,
    onChange,
    onCursorChange,
    readOnly = false,
    placeholder,
    rows = 20,
    className,
    currentLine,
    highlightLine,
  }, forwardedRef) {
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);

    // Expose editor ref to parent
    useImperativeHandle(forwardedRef, () => editorRef.current, []);

    // Sync cursor position to show blue highlight on the specified line
    // This works for both readonly and editable editors
    useEffect(() => {
      const editor = editorRef.current;
      if (!editor || !highlightLine) return;

      const currentPosition = editor.getPosition();
      
      // Only update if we're not already on that line
      // This prevents cursor jumps while user is typing
      if (currentPosition && currentPosition.lineNumber === highlightLine) {
        return;
      }

      // Set cursor position to the highlighted line
      // This will trigger Monaco's native blue line highlight
      editor.setPosition({ lineNumber: highlightLine, column: 1 });
      editor.revealLineInCenter(highlightLine);
    }, [highlightLine]);

    const handleEditorChange = (value: string | undefined) => {
      if (!readOnly && onChange) {
        onChange(value || "");
      }
    };

    const handleEditorDidMount = (editor: any, monaco: any) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      
      // Define custom theme matching your app's design
      monaco.editor.defineTheme('translation-theme', {
        base: 'vs',
        inherit: true,
        rules: [
          { token: '', foreground: '0a0a0a' },
        ],
        colors: {
          'editor.background': '#ffffff',
          'editor.foreground': '#0a0a0a',
          'editor.lineHighlightBackground': '#dbeafe', // Light blue-100
          'editor.lineHighlightBorder': '#00000000', // Transparent (no border)
          'editorLineNumber.foreground': '#9ca3af', // Gray-400
          'editorLineNumber.activeForeground': '#3b82f6', // Blue-500
          'editor.selectionBackground': '#bfdbfe', // Blue-200
          'editor.inactiveSelectionBackground': '#bfdbfe', // Blue-200 (same as active)
          'editorCursor.foreground': '#3b82f6', // Blue-500
        }
      });
      
      monaco.editor.setTheme('translation-theme');

      // Listen for cursor position changes
      editor.onDidChangeCursorPosition((e: any) => {
        if (onCursorChange && e.position) {
          // Pass line number directly
          onCursorChange(e.position.lineNumber);
        }
      });

      // Scroll to current line if provided
      if (currentLine) {
        editor.revealLineInCenter(currentLine);
      }
    };

    return (
      <div className={cn("border rounded-md overflow-hidden h-full", className)}>
        <Editor
          height="100%"
          defaultLanguage="markdown"
          value={value}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
          options={{
            readOnly,
            minimap: { enabled: false },
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 10,
            lineNumbers: "on",
            lineNumbersMinChars: 4,
            occurrencesHighlight: "off",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            wrappingStrategy: "advanced",
            fontSize: 14,
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
            lineHeight: 22,
            padding: {
              top: 22,
              bottom: 22,
            },
            
            scrollbar: {
              vertical: "visible",
              horizontal: "visible",
              useShadows: false,
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            renderLineHighlight: "all",
            renderLineHighlightOnlyWhenFocus: false,
            automaticLayout: true,
            quickSuggestions: false,
            suggest: { showWords: false },
            acceptSuggestionOnCommitCharacter: false,
            acceptSuggestionOnEnter: "off",
            contextmenu: false,
            selectionHighlight: false,
            selectOnLineNumbers: true,
          }}
          theme="translation-theme"
        />
      </div>
    );
  }
);

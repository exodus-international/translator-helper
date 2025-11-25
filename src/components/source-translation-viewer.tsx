import { RawEditorPane } from '@/components/raw-editor-panel';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Eye, FileEdit, Save, Trash2, X } from 'lucide-react';
import { ReactNode, forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type ViewerVariant = 'translate' | 'review';

export interface SourceTranslationViewerHandle {
  enterTranslationEditMode: () => void;
  exitTranslationEditMode: () => void;
}

interface SourceTranslationViewerProps {
  variant: ViewerVariant;
  className?: string;
  layout?: 'default' | 'zen';
  sourceContent: string;
  sourceFormattedContent: string;
  translationContent: string;
  translationFormattedContent?: string;
  translationPlaceholder?: string;
  translationPreviewEmptyText?: string;
  onTranslationChange?: (value: string) => void;
  sourceBadge?: ReactNode;
  translationBadge?: ReactNode;
  sourceHeaderExtra?: ReactNode;
  translationHeaderExtra?: ReactNode;
  // Source editing props
  canEditSource?: boolean;
  onSourceChange?: (value: string) => void;
  onSourceSave?: () => void | Promise<void>;
  onSourceDelete?: () => void | Promise<void>;
  sourceEditContent?: string;
  reviewConfig?: {
    canEdit?: boolean;
    editButtonLabel?: string;
    renderEditActions?: (ctx: { exitEditMode: () => void }) => ReactNode;
    editingDefault?: boolean;
    headerExtra?: ReactNode;
  };
}

const mapLineNumber = (_lineNumber: number, _fromTotal: number, toTotal: number) => {
  return Math.min(Math.max(_lineNumber, 1), Math.max(toTotal, 1));
};

export const SourceTranslationViewer = forwardRef<SourceTranslationViewerHandle, SourceTranslationViewerProps>(
  function SourceTranslationViewer(
    {
      variant,
      className,
      layout = 'default',
      sourceContent,
      sourceFormattedContent,
      translationContent,
      translationFormattedContent,
      translationPlaceholder = 'Enter your translation here...',
      translationPreviewEmptyText = '*No content yet...*',
      onTranslationChange,
      sourceBadge,
      translationBadge,
      sourceHeaderExtra,
      translationHeaderExtra,
      canEditSource = false,
      onSourceChange,
      onSourceSave,
      onSourceDelete,
      sourceEditContent,
      reviewConfig,
    },
    ref,
  ) {
    const isZen = layout === 'zen';
    const [mounted, setMounted] = useState(false);
    const [sourceViewMode, setSourceViewMode] = useState<'formatted' | 'raw'>('raw');
    const [translateTab, setTranslateTab] = useState<'edit' | 'preview'>('edit');
    const [reviewViewMode, setReviewViewMode] = useState<'formatted' | 'raw'>('raw');
    const [isReviewEditing, setIsReviewEditing] = useState(reviewConfig?.editingDefault ?? false);
    const [isSourceEditing, setIsSourceEditing] = useState(false);
    const [sourceEditValue, setSourceEditValue] = useState(sourceEditContent ?? sourceContent);
    const [sourceSaving, setSourceSaving] = useState(false);
    const [sourceLine, setSourceLine] = useState(1);
    const [translationLine, setTranslationLine] = useState(1);
    const [syncedSourceLine, setSyncedSourceLine] = useState<number | undefined>(undefined);
    const [syncedTranslationLine, setSyncedTranslationLine] = useState<number | undefined>(undefined);

    useEffect(() => {
      setMounted(true);
    }, []);

    const translationPreview = translationFormattedContent ?? translationContent;
    const translationRawVisible =
      variant === 'translate' ? translateTab === 'edit' : isReviewEditing || reviewViewMode === 'raw';

    // Update source edit value when sourceEditContent prop changes
    useEffect(() => {
      if (sourceEditContent !== undefined) {
        setSourceEditValue(sourceEditContent);
      }
    }, [sourceEditContent]);

    const handleSourceEditChange = (value: string) => {
      setSourceEditValue(value);
      onSourceChange?.(value);
    };

    const handleSourceSave = async () => {
      if (!onSourceSave) return;
      setSourceSaving(true);
      try {
        await onSourceSave();
        setIsSourceEditing(false);
      } catch (error) {
        console.error('Error saving source:', error);
      } finally {
        setSourceSaving(false);
      }
    };

    const handleSourceCancel = () => {
      setSourceEditValue(sourceEditContent ?? sourceContent);
      setIsSourceEditing(false);
    };

    const handleSourceDelete = async () => {
      if (!onSourceDelete) return;
      if (!confirm('Are you sure you want to delete this source version? This action cannot be undone.')) {
        return;
      }
      try {
        await onSourceDelete();
      } catch (error) {
        console.error('Error deleting source:', error);
      }
    };

    const enterSourceEditMode = () => {
      if (!canEditSource) return;
      setSourceEditValue(sourceEditContent ?? sourceContent);
      setIsSourceEditing(true);
      setSourceViewMode('raw');
    };

    const handleSourceCursorChange = (lineNumber: number) => {
      setSourceLine(lineNumber);
      if (!translationRawVisible) {
        setSyncedTranslationLine(undefined);
        return;
      }

      const sourceTotalLines = sourceContent.split('\n').length;
      const translationTotalLines = translationContent.split('\n').length;
      const translationTargetLine = mapLineNumber(lineNumber, sourceTotalLines, translationTotalLines);
      setSyncedTranslationLine(translationTargetLine);
    };

    const handleTranslationCursorChange = (lineNumber: number) => {
      setTranslationLine(lineNumber);
      if (sourceViewMode !== 'raw') {
        setSyncedSourceLine(undefined);
        return;
      }

      const sourceTotalLines = sourceContent.split('\n').length;
      const translationTotalLines = translationContent.split('\n').length;
      const sourceTargetLine = mapLineNumber(lineNumber, translationTotalLines, sourceTotalLines);
      setSyncedSourceLine(sourceTargetLine);
    };

    const cardClassName = isZen ? 'p-4 h-full flex flex-col' : 'p-6';
    const bodyClassName = isZen ? 'flex-1 overflow-hidden' : undefined;

    const exitReviewEditMode = () => {
      setIsReviewEditing(false);
      setReviewViewMode('raw');
      setSyncedTranslationLine(undefined);
    };

    const enterReviewEditMode = () => {
      if (!reviewConfig?.canEdit) return;
      setIsReviewEditing(true);
      setTranslateTab('edit');
    };

    const translationEditActions = useMemo(() => {
      if (variant !== 'review' || !isReviewEditing) return null;
      return reviewConfig?.renderEditActions?.({ exitEditMode: exitReviewEditMode });
    }, [variant, isReviewEditing, reviewConfig]);

    useImperativeHandle(
      ref,
      () => ({
        enterTranslationEditMode: () => {
          if (variant === 'translate') {
            setTranslateTab('edit');
          } else {
            enterReviewEditMode();
          }
        },
        exitTranslationEditMode: () => {
          if (variant === 'translate') {
            setTranslateTab('preview');
          } else {
            exitReviewEditMode();
          }
        },
      }),
      [variant, enterReviewEditMode, exitReviewEditMode],
    );

    return (
      <div className={cn('grid grid-cols-2 gap-6', className, isZen && 'gap-4 h-full')}>
        <Card className={cn(cardClassName)}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Source (English)</h2>
            <div className="flex items-center gap-2">
              {!isSourceEditing && (
                mounted ? (
                  <Tabs value={sourceViewMode} onValueChange={(value) => setSourceViewMode(value as 'formatted' | 'raw')}>
                    <TabsList>
                      <TabsTrigger value="formatted">Formatted</TabsTrigger>
                      <TabsTrigger value="raw">Raw</TabsTrigger>
                    </TabsList>
                  </Tabs>
                ) : (
                  <div className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
                    <button
                      type="button"
                      disabled
                      className={cn(
                        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                        sourceViewMode === 'formatted' && 'bg-background shadow-sm',
                      )}
                    >
                      Formatted
                    </button>
                    <button
                      type="button"
                      disabled
                      className={cn(
                        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                        sourceViewMode === 'raw' && 'bg-background shadow-sm',
                      )}
                    >
                      Raw
                    </button>
                  </div>
                )
              )}
              {sourceBadge}
              {canEditSource && !isSourceEditing && (
                <>
                  <Button variant="outline" size="sm" onClick={enterSourceEditMode}>
                    <FileEdit className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  {/* <Button variant="outline" size="sm" onClick={handleSourceDelete}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button> */}
                </>
              )}
              {isSourceEditing && (
                <>
                  <Button variant="outline" size="sm" onClick={handleSourceSave} disabled={sourceSaving}>
                    <Save className="h-4 w-4 mr-2" />
                    {sourceSaving ? 'Saving...' : 'Save'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleSourceCancel} disabled={sourceSaving}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </>
              )}
              {sourceHeaderExtra}
            </div>
          </div>
          <div className={bodyClassName}>
            {isSourceEditing ? (
              <RawEditorPane
                value={sourceEditValue}
                onChange={handleSourceEditChange}
                currentLine={sourceLine}
                highlightLine={syncedSourceLine}
                onCursorChange={handleSourceCursorChange}
                fullHeight={isZen}
                lineInfo={{
                  primaryLabel: 'Source Line',
                  primaryValue: sourceLine,
                  secondaryLabel: translationRawVisible ? 'Translation Line' : undefined,
                  secondaryValue: translationRawVisible ? (syncedTranslationLine ?? translationLine) : undefined,
                  direction: 'to',
                }}
              />
            ) : sourceViewMode === 'formatted' ? (
              <div className="prose max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{sourceFormattedContent}</ReactMarkdown>
              </div>
            ) : (
              <RawEditorPane
                value={sourceContent}
                readOnly
                currentLine={sourceLine}
                highlightLine={syncedSourceLine}
                onCursorChange={handleSourceCursorChange}
                fullHeight={isZen}
                lineInfo={{
                  primaryLabel: 'Source Line',
                  primaryValue: sourceLine,
                  secondaryLabel: translationRawVisible ? 'Translation Line' : undefined,
                  secondaryValue: translationRawVisible ? (syncedTranslationLine ?? translationLine) : undefined,
                  direction: 'to',
                }}
              />
            )}
          </div>
        </Card>

        <Card className={cn(cardClassName)}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Translation</h2>
            <div className="flex items-center gap-2">
              {variant === 'translate' ? (
                mounted ? (
                  <Tabs value={translateTab} onValueChange={(value) => setTranslateTab(value as 'edit' | 'preview')}>
                    <TabsList>
                      <TabsTrigger value="edit">
                        <FileEdit className="h-4 w-4 mr-2" />
                        Edit
                      </TabsTrigger>
                      <TabsTrigger value="preview">
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                ) : (
                  <div className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
                    <button
                      type="button"
                      disabled
                      className={cn(
                        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                        translateTab === 'edit' && 'bg-background shadow-sm',
                      )}
                    >
                      <FileEdit className="h-4 w-4 mr-2" />
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled
                      className={cn(
                        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                        translateTab === 'preview' && 'bg-background shadow-sm',
                      )}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </button>
                  </div>
                )
              ) : !isReviewEditing ? (
                mounted ? (
                  <Tabs value={reviewViewMode} onValueChange={(value) => setReviewViewMode(value as 'formatted' | 'raw')}>
                    <TabsList>
                      <TabsTrigger value="formatted">Formatted</TabsTrigger>
                      <TabsTrigger value="raw">Raw</TabsTrigger>
                    </TabsList>
                  </Tabs>
                ) : (
                  <div className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
                    <button
                      type="button"
                      disabled
                      className={cn(
                        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                        reviewViewMode === 'formatted' && 'bg-background shadow-sm',
                      )}
                    >
                      Formatted
                    </button>
                    <button
                      type="button"
                      disabled
                      className={cn(
                        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium',
                        reviewViewMode === 'raw' && 'bg-background shadow-sm',
                      )}
                    >
                      Raw
                    </button>
                  </div>
                )
              ) : null}
              {translationBadge}
              {variant === 'review' && !isReviewEditing && reviewConfig?.canEdit && (
                <Button variant="outline" size="sm" onClick={enterReviewEditMode}>
                  {reviewConfig?.editButtonLabel || 'Edit'}
                </Button>
              )}
              {translationHeaderExtra}
              {variant === 'review' && reviewConfig?.headerExtra}
            </div>
          </div>

          <div className={bodyClassName}>
            {variant === 'translate' ? (
              translateTab === 'edit' ? (
                <RawEditorPane
                  value={translationContent}
                  onChange={onTranslationChange}
                  onCursorChange={handleTranslationCursorChange}
                  placeholder={translationPlaceholder}
                  currentLine={translationLine}
                  highlightLine={syncedTranslationLine}
                  fullHeight={isZen}
                  lineInfo={{
                    primaryLabel: 'Translation Line',
                    primaryValue: translationLine,
                    secondaryLabel: sourceViewMode === 'raw' ? 'Source Line' : undefined,
                    secondaryValue: sourceViewMode === 'raw' ? (syncedSourceLine ?? sourceLine) : undefined,
                    direction: 'from',
                  }}
                />
              ) : (
                <div className="prose max-w-none min-h-[500px]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {translationPreview || translationPreviewEmptyText}
                  </ReactMarkdown>
                </div>
              )
            ) : isReviewEditing ? (
              <div className={cn('space-y-4', isZen && 'h-full flex flex-col')}>
                <RawEditorPane
                  value={translationContent}
                  onChange={onTranslationChange}
                  onCursorChange={handleTranslationCursorChange}
                  currentLine={translationLine}
                  highlightLine={syncedTranslationLine}
                  fullHeight={isZen}
                  lineInfo={
                    sourceViewMode === 'raw'
                      ? {
                          primaryLabel: 'Translation Line',
                          primaryValue: translationLine,
                          secondaryLabel: 'Source Line',
                          secondaryValue: sourceLine,
                          direction: 'from',
                        }
                      : undefined
                  }
                />
                {translationEditActions}
              </div>
            ) : reviewViewMode === 'formatted' ? (
              <div className="prose max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{translationPreview}</ReactMarkdown>
              </div>
            ) : (
              <RawEditorPane
                value={translationContent}
                readOnly
                currentLine={translationLine}
                highlightLine={syncedTranslationLine}
                onCursorChange={handleTranslationCursorChange}
                lineInfo={{
                  primaryLabel: 'Translation Line',
                  primaryValue: translationLine,
                  secondaryLabel: sourceViewMode === 'raw' ? 'Source Line' : undefined,
                  secondaryValue: sourceViewMode === 'raw' ? (syncedSourceLine ?? sourceLine) : undefined,
                  direction: 'from',
                }}
              />
            )}
          </div>
        </Card>
      </div>
    );
  },
);

import { RawEditorPane } from "@/components/raw-editor-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Eye, FileEdit } from "lucide-react";
import {
  ReactNode,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ViewerVariant = "translate" | "review";

export interface SourceTranslationViewerHandle {
  enterTranslationEditMode: () => void;
  exitTranslationEditMode: () => void;
}

interface SourceTranslationViewerProps {
  variant: ViewerVariant;
  className?: string;
  layout?: "default" | "zen";
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

export const SourceTranslationViewer = forwardRef<
  SourceTranslationViewerHandle,
  SourceTranslationViewerProps
>(function SourceTranslationViewer(
  {
    variant,
    className,
    layout = "default",
    sourceContent,
    sourceFormattedContent,
    translationContent,
    translationFormattedContent,
    translationPlaceholder = "Enter your translation here...",
    translationPreviewEmptyText = "*No content yet...*",
    onTranslationChange,
    sourceBadge,
    translationBadge,
    sourceHeaderExtra,
    translationHeaderExtra,
    reviewConfig,
  },
  ref
) {
  const isZen = layout === "zen";
  const [sourceViewMode, setSourceViewMode] = useState<"formatted" | "raw">("raw");
  const [translateTab, setTranslateTab] = useState<"edit" | "preview">("edit");
  const [reviewViewMode, setReviewViewMode] = useState<"formatted" | "raw">("raw");
  const [isReviewEditing, setIsReviewEditing] = useState(
    reviewConfig?.editingDefault ?? false
  );
  const [sourceLine, setSourceLine] = useState(1);
  const [translationLine, setTranslationLine] = useState(1);
  const [syncedSourceLine, setSyncedSourceLine] = useState<number | undefined>(undefined);
  const [syncedTranslationLine, setSyncedTranslationLine] = useState<number | undefined>(
    undefined
  );

  const translationPreview = translationFormattedContent ?? translationContent;
  const translationRawVisible =
    variant === "translate"
      ? translateTab === "edit"
      : isReviewEditing || reviewViewMode === "raw";

  const handleSourceCursorChange = (lineNumber: number) => {
    setSourceLine(lineNumber);
    if (!translationRawVisible) {
      setSyncedTranslationLine(undefined);
      return;
    }

    const sourceTotalLines = sourceContent.split("\n").length;
    const translationTotalLines = translationContent.split("\n").length;
    const translationTargetLine = mapLineNumber(
      lineNumber,
      sourceTotalLines,
      translationTotalLines
    );
    setSyncedTranslationLine(translationTargetLine);
  };

  const handleTranslationCursorChange = (lineNumber: number) => {
    setTranslationLine(lineNumber);
    if (sourceViewMode !== "raw") {
      setSyncedSourceLine(undefined);
      return;
    }

    const sourceTotalLines = sourceContent.split("\n").length;
    const translationTotalLines = translationContent.split("\n").length;
    const sourceTargetLine = mapLineNumber(
      lineNumber,
      translationTotalLines,
      sourceTotalLines
    );
    setSyncedSourceLine(sourceTargetLine);
  };

  const cardClassName = isZen ? "p-4 h-full flex flex-col" : "p-6";
  const bodyClassName = isZen ? "flex-1 overflow-hidden" : undefined;

  const exitReviewEditMode = () => {
    setIsReviewEditing(false);
    setReviewViewMode("raw");
    setSyncedTranslationLine(undefined);
  };

  const enterReviewEditMode = () => {
    if (!reviewConfig?.canEdit) return;
    setIsReviewEditing(true);
    setTranslateTab("edit");
  };

  const translationEditActions = useMemo(() => {
    if (variant !== "review" || !isReviewEditing) return null;
    return reviewConfig?.renderEditActions?.({ exitEditMode: exitReviewEditMode });
  }, [variant, isReviewEditing, reviewConfig]);

  useImperativeHandle(
    ref,
    () => ({
      enterTranslationEditMode: () => {
        if (variant === "translate") {
          setTranslateTab("edit");
        } else {
          enterReviewEditMode();
        }
      },
      exitTranslationEditMode: () => {
        if (variant === "translate") {
          setTranslateTab("preview");
        } else {
          exitReviewEditMode();
        }
      },
    }),
    [variant, enterReviewEditMode, exitReviewEditMode]
  );

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-6",
        className,
        isZen && "gap-4 h-full"
      )}
    >
      <Card className={cn(cardClassName)}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Source (English)</h2>
          <div className="flex items-center gap-2">
            <Tabs value={sourceViewMode} onValueChange={(value) => setSourceViewMode(value as "formatted" | "raw")}>
              <TabsList>
                <TabsTrigger value="formatted">Formatted</TabsTrigger>
                <TabsTrigger value="raw">Raw</TabsTrigger>
              </TabsList>
            </Tabs>
            {sourceBadge}
            {sourceHeaderExtra}
          </div>
        </div>
        <div className={bodyClassName}>
          {sourceViewMode === "formatted" ? (
            <div className="prose max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {sourceFormattedContent}
              </ReactMarkdown>
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
                primaryLabel: "Source Line",
                primaryValue: sourceLine,
                secondaryLabel: translationRawVisible ? "Translation Line" : undefined,
                secondaryValue: translationRawVisible ? (syncedTranslationLine ?? translationLine) : undefined,
                direction: "to",
              }}
            />
          )}
        </div>
      </Card>

      <Card className={cn(cardClassName)}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Translation</h2>
          <div className="flex items-center gap-2">
            {variant === "translate" ? (
              <Tabs value={translateTab} onValueChange={(value) => setTranslateTab(value as "edit" | "preview")}>
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
            ) : !isReviewEditing ? (
              <Tabs
                value={reviewViewMode}
                onValueChange={(value) => setReviewViewMode(value as "formatted" | "raw")}
              >
                <TabsList>
                  <TabsTrigger value="formatted">Formatted</TabsTrigger>
                  <TabsTrigger value="raw">Raw</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
            {translationBadge}
            {variant === "review" && !isReviewEditing && reviewConfig?.canEdit && (
              <Button variant="outline" size="sm" onClick={enterReviewEditMode}>
                {reviewConfig?.editButtonLabel || "Edit"}
              </Button>
            )}
            {translationHeaderExtra}
            {variant === "review" && reviewConfig?.headerExtra}
          </div>
        </div>

        <div className={bodyClassName}>
          {variant === "translate" ? (
            translateTab === "edit" ? (
              <RawEditorPane
                value={translationContent}
                onChange={onTranslationChange}
                onCursorChange={handleTranslationCursorChange}
                placeholder={translationPlaceholder}
                currentLine={translationLine}
                highlightLine={syncedTranslationLine}
                fullHeight={isZen}
                lineInfo={{
                  primaryLabel: "Translation Line",
                  primaryValue: translationLine,
                  secondaryLabel: sourceViewMode === "raw" ? "Source Line" : undefined,
                  secondaryValue: sourceViewMode === "raw" ? (syncedSourceLine ?? sourceLine) : undefined,
                  direction: "from",
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
            <div className={cn("space-y-4", isZen && "h-full flex flex-col")}>
              <RawEditorPane
                value={translationContent}
                onChange={onTranslationChange}
                onCursorChange={handleTranslationCursorChange}
                currentLine={translationLine}
                highlightLine={syncedTranslationLine}
                fullHeight={isZen}
                lineInfo={
                  sourceViewMode === "raw"
                    ? {
                        primaryLabel: "Translation Line",
                        primaryValue: translationLine,
                        secondaryLabel: "Source Line",
                        secondaryValue: sourceLine,
                        direction: "from",
                      }
                    : undefined
                }
              />
              {translationEditActions}
            </div>
          ) : reviewViewMode === "formatted" ? (
            <div className="prose max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {translationPreview}
              </ReactMarkdown>
            </div>
          ) : (
            <RawEditorPane
              value={translationContent}
              readOnly
              currentLine={translationLine}
              highlightLine={syncedTranslationLine}
              onCursorChange={handleTranslationCursorChange}
              lineInfo={{
                primaryLabel: "Translation Line",
                primaryValue: translationLine,
                secondaryLabel: sourceViewMode === "raw" ? "Source Line" : undefined,
                secondaryValue: sourceViewMode === "raw" ? (syncedSourceLine ?? sourceLine) : undefined,
                direction: "from",
              }}
            />
          )}
        </div>
      </Card>
    </div>
  );
});

import type { Column, RowData } from "@tanstack/react-table";

import type { DataTableFeatures } from "@/hooks/use-data-table";

export function getColumnPinningStyle<TData extends RowData>({
  column,
  withBorder = false,
}: {
  column: Column<DataTableFeatures, TData>;
  withBorder?: boolean;
}): React.CSSProperties {
  const isPinned = column.getIsPinned();
  const isLastLeftPinnedColumn =
    isPinned === "start" && column.getIsLastColumn("start");
  const isFirstRightPinnedColumn =
    isPinned === "end" && column.getIsFirstColumn("end");

  return {
    boxShadow: withBorder
      ? isLastLeftPinnedColumn
        ? "-4px 0 4px -4px var(--border) inset"
        : isFirstRightPinnedColumn
          ? "4px 0 4px -4px var(--border) inset"
          : undefined
      : undefined,
    // v9 pinning uses logical start/end; the DOM positioning stays physical.
    left: isPinned === "start" ? `${column.getStart("start")}px` : undefined,
    right: isPinned === "end" ? `${column.getAfter("end")}px` : undefined,
    opacity: isPinned ? 0.97 : 1,
    position: isPinned ? "sticky" : "relative",
    background: isPinned ? "var(--background)" : "var(--background)",
    // Only stamp an explicit width when the column declared one (or is pinned,
    // where sticky offsets need fixed widths); otherwise let the table lay
    // columns out naturally.
    width:
      isPinned || column.columnDef.size !== undefined
        ? column.getSize()
        : undefined,
    zIndex: isPinned ? 1 : undefined,
  };
}

import type {
  CellData,
  ColumnSort,
  RowData,
  TableFeatures,
} from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  // The generic parameters are unused here but must match TanStack's own
  // ColumnMeta signature for declaration merging to apply.
  interface ColumnMeta<
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    in out TFeatures extends TableFeatures,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    in out TData extends RowData,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    TValue extends CellData,
  > {
    label?: string;
    placeholder?: string;
    variant?: FilterVariant;
    options?: Option[];
    range?: [number, number];
    unit?: string;
    icon?: React.ComponentType<React.ComponentProps<"svg">>;
    /** Extra class names applied to this column's header and body cells. */
    className?: string;
  }
}

export interface Option {
  label: string;
  value: string;
  count?: number;
  icon?: React.ComponentType<React.ComponentProps<"svg">>;
}

export type FilterVariant = "text" | "select" | "multiSelect";

export interface ExtendedColumnSort<TData> extends Omit<ColumnSort, "id"> {
  id: Extract<keyof TData, string>;
}

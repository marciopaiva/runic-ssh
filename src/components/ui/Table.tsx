import { type ReactNode, useState, useMemo, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/classnames';
import { ChevronUpIcon, ChevronDownIcon } from './icons';

export interface Column<T> {
  readonly key: string;
  readonly header: ReactNode;
  readonly accessor: (row: T) => ReactNode;
  readonly width?: string | number;
  readonly minWidth?: string | number;
  readonly maxWidth?: string | number;
  readonly align?: 'left' | 'center' | 'right';
  readonly sortable?: boolean;
  readonly sticky?: boolean;
  readonly renderHeader?: (props: { sortDirection: 'asc' | 'desc' | null; onSort: () => void }) => ReactNode;
  readonly cellClassName?: string;
  readonly headerClassName?: string;
}

export interface TableProps<T> {
  readonly columns: readonly Column<T>[];
  readonly data: readonly T[];
  readonly keyAccessor: (row: T) => string;
  readonly sortable?: boolean;
  readonly selectable?: boolean;
  readonly selectedKeys?: readonly string[];
  readonly onSelectionChange?: (keys: readonly string[]) => void;
  readonly onRowClick?: (row: T) => void | undefined;
  readonly emptyMessage?: ReactNode;
  readonly loading?: boolean;
  readonly stickyHeader?: boolean;
  readonly maxHeight?: string | number;
  readonly className?: string;
  readonly rowClassName?: (row: T) => string;
  readonly striped?: boolean;
  readonly hoverable?: boolean;
  readonly bordered?: boolean;
}

function TableHeader<T>({
  columns,
  sortColumn,
  sortDirection,
  onSort,
  selectable,
  onSelectAll,
  allSelected,
  indeterminate,
  className,
}: {
  readonly columns: readonly Column<T>[];
  readonly sortColumn: string | null;
  readonly sortDirection: 'asc' | 'desc' | null;
  readonly onSort: (key: string) => void;
  readonly selectable?: boolean;
  readonly selectedKeys?: readonly string[];
  readonly onSelectAll?: () => void;
  readonly allSelected?: boolean;
  readonly indeterminate?: boolean;
  readonly className?: string;
}) {
  return (
    <thead className={cn('bg-surface-chrome border-b border-line-subtle', className)}>
      <tr className="h-9">
        {selectable && (
          <th className="w-10 px-2">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = indeterminate ?? false; }}
              onChange={onSelectAll}
              className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent"
              aria-label="Select all rows"
            />
          </th>
        )}
        {columns.map((column) => (
          <th
            key={column.key}
            scope="col"
            className={cn(
              'px-3 py-2 text-left text-[10.5px] font-semibold text-ink-faint uppercase tracking-[0.08em]',
              'whitespace-nowrap overflow-hidden',
              column.sticky && 'sticky left-0 z-10 bg-surface-chrome',
              column.headerClassName,
            )}
            style={{
              width: column.width,
              minWidth: column.minWidth,
              maxWidth: column.maxWidth,
            } as CSSProperties}
          >
            {column.sortable ? (
              <button
                type="button"
                onClick={() => onSort(column.key)}
                className={cn(
                  'flex items-center gap-1.5 hover:text-ink',
                  'transition-colors duration-fast easing-standard',
                  'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-base rounded',
                )}
                aria-sort={
                  sortColumn === column.key
                    ? sortDirection === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
              >
                {column.renderHeader?.({ sortDirection, onSort: () => onSort(column.key) }) ?? column.header}
                {sortColumn === column.key && (
                  <span className="flex-shrink-0">
                    {sortDirection === 'asc' ? <ChevronUpIcon className="h-3.5 w-3.5" /> : <ChevronDownIcon className="h-3.5 w-3.5" />}
                  </span>
                )}
              </button>
            ) : (
              column.header
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function TableBody<T>({
  columns,
  data,
  keyAccessor,
  selectedKeys,
  onRowSelect,
  onRowClick,
  rowClassName,
  striped,
  hoverable,
  bordered,
  className,
}: {
  readonly columns: readonly Column<T>[];
  readonly data: readonly T[];
  readonly keyAccessor: (row: T) => string;
  readonly selectedKeys?: readonly string[];
  readonly onRowSelect?: (key: string, selected: boolean) => void;
  readonly onRowClick?: (row: T) => void | undefined;
  readonly rowClassName?: (row: T) => string;
  readonly striped?: boolean;
  readonly hoverable?: boolean;
  readonly bordered?: boolean;
  readonly className?: string;
}) {
  if (data.length === 0) return null;

  return (
    <tbody className={cn('divide-y divide-line-subtle', className)}>
      {data.map((row, index) => {
        const key = keyAccessor(row);
        const isSelected = selectedKeys?.includes(key);
        const rowStyle = rowClassName?.(row);

        return (
          <motion.tr
            key={key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15, delay: index * 0.02 }}
            className={cn(
              'transition-colors duration-fast easing-standard',
              'focus-within:bg-accent/5',
              isSelected && 'bg-accent/5',
              hoverable && 'hover:bg-surface-raised/50',
              striped && index % 2 === 1 && 'bg-surface-chrome/50',
              bordered && 'border-b border-line-subtle',
              onRowClick && 'cursor-pointer',
              rowStyle,
            )}
            onClick={() => onRowClick?.(row)}
            onDoubleClick={() => onRowClick?.(row)}
            tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && onRowClick) {
                e.preventDefault();
                onRowClick(row);
              }
            }}
          >
            {selectedKeys !== undefined && (
              <td className="px-2">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => onRowSelect?.(key, e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4 rounded border-line-strong text-accent focus:ring-accent"
                  aria-label="Select row"
                />
              </td>
            )}
            {columns.map((column) => (
              <td
                key={column.key}
                className={cn(
                  'px-3 py-2 text-[12.5px] text-ink-secondary',
                  'whitespace-nowrap overflow-hidden text-ellipsis',
                  column.align === 'center' && 'text-center',
                  column.align === 'right' && 'text-right',
                  column.cellClassName,
                )}
                style={{
                  width: column.width,
                  minWidth: column.minWidth,
                  maxWidth: column.maxWidth,
                } as CSSProperties}
              >
                {column.accessor(row)}
              </td>
            ))}
          </motion.tr>
        );
      })}
    </tbody>
  );
}

export function Table<T>({
  columns,
  data,
  keyAccessor,
  sortable = false,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  onRowClick,
  emptyMessage = 'No data',
  loading = false,
  stickyHeader = false,
  maxHeight,
  className,
  rowClassName,
  striped = false,
  hoverable = true,
  bordered = false,
}: TableProps<T>) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);

  const handleSort = (key: string) => {
    if (!sortable) return;
    if (sortColumn === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc'));
      if (sortDirection === 'desc') setSortColumn(null);
    } else {
      setSortColumn(key);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = () => {
    if (allSelected) {
      onSelectionChange?.([]);
    } else {
      onSelectionChange?.(data.map(keyAccessor));
    }
  };

  const allSelected = data.length > 0 && data.every((row) => selectedKeys.includes(keyAccessor(row)));
  const indeterminate = data.some((row) => selectedKeys.includes(keyAccessor(row))) && !allSelected;

  const sortedData = useMemo(() => {
    if (!sortColumn || !sortDirection) return data;
    return [...data].sort((a, b) => {
      const aVal = columns.find((c) => c.key === sortColumn)?.accessor(a);
      const bVal = columns.find((c) => c.key === sortColumn)?.accessor(b);
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const aStr = String(aVal);
      const bStr = String(bVal);
      return sortDirection === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [data, sortColumn, sortDirection, columns]);

  const handleRowSelect = (key: string, selected: boolean) => {
    const newKeys = selected
      ? [...selectedKeys, key]
      : selectedKeys.filter((k) => k !== key);
    onSelectionChange?.(newKeys);
  };

  const handleRowClick = onRowClick ?? (() => {});
  const handleRowClassName = rowClassName ?? (() => '');

  return (
    <div className={cn('overflow-hidden rounded-lg border border-line-subtle bg-surface-base', className)}>
      {loading && (
        <div className="absolute inset-0 z-10 bg-surface-base/80 flex items-center justify-center">
          <svg className="h-6 w-6 animate-spin text-accent" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="31.4 31.4" />
          </svg>
        </div>
      )}
      <div
        className={cn(
          'overflow-x-auto',
          stickyHeader && 'relative',
          maxHeight && 'max-h-[500px]',
        )}
        style={{ maxHeight }}
      >
        <table className="w-full border-collapse" role="grid">
          <TableHeader
            columns={columns}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            onSort={handleSort}
            selectable={selectable}
            selectedKeys={selectedKeys}
            onSelectAll={handleSelectAll}
            allSelected={allSelected}
            indeterminate={indeterminate}
          />
          <TableBody
            columns={columns}
            data={sortedData}
            keyAccessor={keyAccessor}
            selectedKeys={selectedKeys}
            onRowSelect={handleRowSelect}
            onRowClick={handleRowClick}
            rowClassName={handleRowClassName}
            striped={striped}
            hoverable={hoverable}
            bordered={bordered}
          />
        </table>
        {data.length === 0 && !loading && (
          <div className="p-8 text-center text-ink-muted">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
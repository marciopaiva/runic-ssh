import { type ReactNode, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/classnames';
import { ChevronRightIcon, ChevronLeftIcon } from './icons';

export interface SidebarItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly badge?: number | string;
  readonly disabled?: boolean;
  readonly children?: readonly SidebarItem[];
}

export interface SidebarProps {
  readonly items: readonly SidebarItem[];
  readonly selectedId?: string;
  readonly onSelect: (id: string) => void;
  readonly collapsed?: boolean;
  readonly onToggleCollapse?: () => void;
  readonly width?: number;
  readonly collapsedWidth?: number;
  readonly className?: string;
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
}

const DEFAULT_WIDTH = 280;
const DEFAULT_COLLAPSED_WIDTH = 56;

interface SidebarItemComponentProps {
  readonly item: SidebarItem;
  readonly selectedId: string;
  readonly level?: number;
  readonly collapsed?: boolean;
  readonly onSelect: (id: string) => void;
}

function SidebarItemComponent({
  item,
  selectedId,
  level = 0,
  collapsed = false,
  onSelect,
}: SidebarItemComponentProps) {
  const hasChildren = item.children && item.children.length > 0;
  const [expanded, setExpanded] = useState(false);
  const isSelected = item.id === selectedId;

  const handleClick = () => {
    if (hasChildren) {
      setExpanded((prev) => !prev);
    } else if (!item.disabled) {
      onSelect(item.id);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    } else if (event.key === 'ArrowRight' && hasChildren && !expanded) {
      event.preventDefault();
      setExpanded(true);
    } else if (event.key === 'ArrowLeft' && hasChildren && expanded) {
      event.preventDefault();
      setExpanded(false);
    }
  };

  if (collapsed && level === 0) {
    return (
      <motion.button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={item.disabled}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={isSelected}
        aria-disabled={item.disabled}
        className={cn(
          'relative flex items-center justify-center gap-2 p-2 rounded-md',
          'transition-all duration-fast easing-standard',
          'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-base',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          isSelected
            ? 'bg-accent/10 text-accent'
            : 'text-ink-muted hover:text-ink hover:bg-surface-raised',
        )}
        style={{ width: DEFAULT_COLLAPSED_WIDTH }}
        whileTap={{ scale: 0.95 }}
        title={typeof item.label === 'string' ? item.label : undefined}
      >
        {item.icon && <span className="flex-shrink-0 h-5 w-5">{item.icon}</span>}
        {item.badge !== undefined && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-5 items-center justify-center rounded-full px-1.5 text-[9px] font-bold bg-danger text-surface-base">
            {item.badge}
          </span>
        )}
      </motion.button>
    );
  }

  return (
    <div className={cn('flex flex-col', level > 0 && 'pl-6')}>
      <motion.button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={item.disabled}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={isSelected}
        aria-disabled={item.disabled}
        className={cn(
          'relative flex items-center gap-2 px-2.5 py-2 rounded-md text-left',
          'transition-all duration-fast easing-standard',
          'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-base',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          isSelected
            ? 'bg-accent/10 text-accent'
            : 'text-ink-secondary hover:text-ink hover:bg-surface-raised',
        )}
        whileTap={{ scale: 0.98 }}
        style={{ minWidth: collapsed ? undefined : '100%' }}
      >
        {item.icon && <span className="flex-shrink-0 h-5 w-5">{item.icon}</span>}
        {!collapsed && <span className="truncate flex-1">{item.label}</span>}
        {hasChildren && !collapsed && (
          <motion.span
            className="flex-shrink-0 ml-auto h-4 w-4"
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            <ChevronRightIcon className="h-4 w-4 text-ink-faint" />
          </motion.span>
        )}
        {item.badge !== undefined && !collapsed && (
          <span className="flex-shrink-0 min-w-[16px] h-5 items-center justify-center rounded-full px-1.5 text-[9px] font-bold bg-accent/20 text-accent">
            {item.badge}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {hasChildren && expanded && !collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
            className="mt-1 flex flex-col"
          >
            {item.children?.map((child) => (
              <SidebarItemComponent
                key={child.id}
                item={child}
                selectedId={selectedId || ''}
                level={level + 1}
                collapsed={collapsed}
                onSelect={onSelect}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar({
  items,
  selectedId,
  onSelect,
  collapsed = false,
  onToggleCollapse,
  width = DEFAULT_WIDTH,
  collapsedWidth = DEFAULT_COLLAPSED_WIDTH,
  className,
  header,
  footer,
}: SidebarProps) {
  const currentWidth = collapsed ? collapsedWidth : width;

  return (
    <motion.aside
      className={cn(
        'flex flex-col bg-surface-panel border-r border-line-subtle',
        'overflow-y-auto overflow-x-hidden',
        className,
      )}
      style={{ width: currentWidth, minWidth: currentWidth, maxWidth: currentWidth }}
      animate={{ width: currentWidth }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      role="navigation"
      aria-label="Sidebar"
    >
      {header && (
        <motion.div
          className="flex-shrink-0 px-3 py-3 border-b border-line-subtle"
          animate={{ opacity: collapsed ? 0 : 1, height: collapsed ? 0 : 'auto' }}
          transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          style={{ overflow: 'hidden' }}
        >
          {header}
        </motion.div>
      )}

      <nav className="flex-1 px-2 py-2 space-y-0.5" aria-label="Sidebar navigation">
        {items.map((item) => (
          <SidebarItemComponent
            key={item.id}
            item={item}
            selectedId={selectedId || ''}
            collapsed={collapsed}
            onSelect={onSelect}
          />
        ))}
      </nav>

      {onToggleCollapse && (
        <motion.button
          type="button"
          onClick={onToggleCollapse}
          className={cn(
            'flex-shrink-0 mx-2 mb-2 p-2 rounded-md',
            'text-ink-muted hover:text-ink hover:bg-surface-raised',
            'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface-base',
            'transition-all duration-fast easing-standard',
          )}
          style={{ width: collapsed ? '100%' : undefined }}
          whileTap={{ scale: 0.95 }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRightIcon className="h-5 w-5 mx-auto" />
          ) : (
            <ChevronLeftIcon className="h-5 w-5 mx-auto" />
          )}
        </motion.button>
      )}

      {footer && (
        <motion.div
          className="flex-shrink-0 px-3 py-3 border-t border-line-subtle"
          animate={{ opacity: collapsed ? 0 : 1, height: collapsed ? 0 : 'auto' }}
          transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
          style={{ overflow: 'hidden' }}
        >
          {footer}
        </motion.div>
      )}
    </motion.aside>
  );
}
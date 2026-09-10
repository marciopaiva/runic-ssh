import { type ReactNode, useCallback, useMemo } from 'react';
import { Tab as HeadlessTab, TabGroup, TabList, TabPanel, TabPanels } from '@headlessui/react';
import { cn } from '../../lib/classnames';

export interface TabItem {
  readonly value: string;
  readonly label: ReactNode;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
  readonly badge?: number | string;
}

export interface TabsProps {
  readonly tabs: readonly TabItem[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly orientation?: 'horizontal' | 'vertical';
  readonly variant?: 'line' | 'enclosed' | 'soft';
  readonly fullWidth?: boolean;
  readonly className?: string;
  readonly tabClassName?: string;
  readonly panelClassName?: string;
}

function TabButton({
  tab,
  isSelected,
  variant,
  orientation,
  onSelect,
}: {
  readonly tab: TabItem;
  readonly isSelected: boolean;
  readonly variant: TabsProps['variant'];
  readonly orientation: TabsProps['orientation'];
  readonly onSelect: () => void;
}) {
  const { label, icon, disabled = false, badge } = tab;

  const baseStyles = 'relative inline-flex items-center justify-center gap-2 font-medium transition-all duration-fast easing-standard focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base disabled:opacity-50 disabled:cursor-not-allowed';

  const variantStyles = {
    line: cn(
      'bg-transparent text-ink-muted',
      'hover:text-ink hover:bg-surface-raised/50',
      'data-[selected]:text-accent data-[selected]:bg-transparent',
      orientation === 'horizontal' ? 'px-3 py-2.5 text-[12.5px]' : 'w-full px-3 py-2 text-[12.5px] text-left',
      isSelected && 'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent after:rounded-t-full',
    ),
    enclosed: cn(
      'rounded-md text-ink-muted',
      'hover:text-ink hover:bg-surface-raised',
      'data-[selected]:text-ink data-[selected]:bg-surface-raised data-[selected]:shadow-1',
      orientation === 'horizontal' ? 'px-3 py-2 text-[12.5px]' : 'w-full px-3 py-2 text-[12.5px] text-left',
    ),
    soft: cn(
      'rounded-md text-ink-muted',
      'hover:text-ink hover:bg-surface-raised/50',
      'data-[selected]:text-accent data-[selected]:bg-accent-soft',
      orientation === 'horizontal' ? 'px-3 py-2 text-[12.5px]' : 'w-full px-3 py-2 text-[12.5px] text-left',
    ),
  };

  return (
    <HeadlessTab
      onClick={onSelect}
      disabled={disabled}
      className={({ selected }) => cn(
        baseStyles,
        variantStyles[variant || 'line'],
        selected && 'data-[selected]:true',
      )}
    >
      {icon && <span className="flex-shrink-0 h-4 w-4">{icon}</span>}
      <span className="truncate">{label}</span>
      {badge !== undefined && (
        <span className={cn(
          'flex-shrink-0 min-w-[16px] h-5 items-center justify-center rounded-full px-1.5 text-[9px] font-bold',
          isSelected
            ? 'bg-accent/20 text-accent'
            : 'bg-surface-input text-ink-muted',
        )}>
          {badge}
        </span>
      )}
    </HeadlessTab>
  );
}

function TabPanelWrapper({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <TabPanel className={cn('focus:outline-none', className)}>
      {children}
    </TabPanel>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
  orientation = 'horizontal',
  variant = 'line',
  fullWidth = false,
  className,
  tabClassName,
  panelClassName,
}: TabsProps) {
  const selectedIndex = useMemo(() => tabs.findIndex((t) => t.value === value), [tabs, value]);
  const handleSelect = useCallback((index: number) => {
    const tab = tabs[index];
    if (tab) {
      onChange(tab.value);
    }
  }, [onChange, tabs]);

  return (
    <TabGroup selectedIndex={selectedIndex} onChange={handleSelect} className={cn('w-full', className)}>
      <TabList
        className={cn(
          'flex gap-1 bg-surface-input rounded-md p-1',
          orientation === 'horizontal' ? 'flex-row' : 'flex-col',
          fullWidth && 'w-full',
          tabClassName,
        )}
        aria-orientation={orientation}
      >
        {tabs.map((tab, index) => (
          <TabButton
            key={tab.value}
            tab={tab}
            isSelected={tab.value === value}
            variant={variant}
            orientation={orientation}
            onSelect={() => handleSelect(index)}
          />
        ))}
      </TabList>

      <TabPanels className={cn('mt-3', panelClassName)}>
        {tabs.map((tab) => (
          <TabPanelWrapper key={tab.value} className="animate-in fade-in-0 duration-150 ease-out">
            {tab.label}
          </TabPanelWrapper>
        ))}
      </TabPanels>
    </TabGroup>
  );
}
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Combine clsx + tailwind-merge for composable class names with conflict resolution. */
export function cn(...inputs: unknown[]): string {
  return twMerge(clsx(inputs));
}
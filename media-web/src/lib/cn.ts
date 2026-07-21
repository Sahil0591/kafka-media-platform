import clsx, { type ClassValue } from 'clsx'

/** Conditional class names. Thin alias so imports read consistently. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}

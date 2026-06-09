import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Merges conditional class names and resolves Tailwind utility conflicts.
 *
 * @param {...import("clsx").ClassValue} inputs class name values
 * @returns {string} merged class name string
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

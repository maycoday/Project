/**
 * Utility functions for consistent class merging
 * Used throughout the component library
 */
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes intelligently
 * Resolves conflicts (e.g., 'p-4' + 'p-8' = 'p-8')
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Truncate hash for display
 */
export function truncateHash(hash, length = 8) {
  if (!hash || hash.length <= length * 2) return hash;
  return `${hash.slice(0, length)}...${hash.slice(-length)}`;
}

/**
 * Generate a random reference ID
 */
export function generateReference() {
  return crypto.randomUUID().split('-')[0];
}

/**
 * Sleep utility for simulations
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

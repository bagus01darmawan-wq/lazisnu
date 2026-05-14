/**
 * Utility functions for formatting strings and data
 */

/**
 * Removes "Ranting" or "Ranting " (case-insensitive) from a branch name
 * and trims any leading/trailing whitespace.
 */
export const cleanBranchName = (name?: string): string => {
  if (!name) return 'N/A';
  return name.replace(/ranting/gi, '').trim();
};

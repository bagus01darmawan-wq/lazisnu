/**
 * Utility to convert keys between camelCase and snake_case recursively
 */

/**
 * Check if a value is an object that should be serialized
 */
function isPlainObject(obj: any): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    !(obj instanceof Date) &&
    !(obj instanceof RegExp) &&
    !(obj instanceof Error) &&
    !(obj instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(obj)
  );
}

/**
 * Convert a string from camelCase to snake_case
 */
function toSnakeCase(str: string): string {
  // Handle already snake_case or empty strings
  if (!str || str.includes('_')) return str;
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Recursively transform an object/array:
 * 1. Convert keys from camelCase to snake_case
 * 2. Convert BigInt values to Number (for JSON safety)
 */
export function serializeOutput(data: any): any {
  if (data === null || data === undefined) return data;

  // Handle BigInt
  if (typeof data === 'bigint') return Number(data);

  // Handle Array
  if (Array.isArray(data)) {
    return data.map(serializeOutput);
  }

  // Handle Object
  if (isPlainObject(data)) {
    const newObj: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const snakeKey = toSnakeCase(key);
        // Recursively serialize values
        newObj[snakeKey] = serializeOutput(data[key]);
      }
    }
    return newObj;
  }

  return data;
}

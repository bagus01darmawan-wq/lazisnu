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
 * Recursively convert object keys to snake_case
 */
export function serializeOutput(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(serializeOutput);
  }

  if (isPlainObject(data)) {
    const newObj: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const snakeKey = toSnakeCase(key);
        if (key !== snakeKey) {
          console.log(`[Serializer] Converting key: ${key} -> ${snakeKey}`);
        }
        newObj[snakeKey] = serializeOutput(data[key]);
      }
    }
    return newObj;
  }

  return data;
}

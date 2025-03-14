/**
 * Logger utility for standardized logging and error handling
 */

// Set to false in production
export const DEBUG_MODE = process.env.NODE_ENV === 'development';

/**
 * Log a message to the console (only in debug mode)
 */
export function log(...args: any[]): void {
  if (DEBUG_MODE) {
    console.log(...args);
  }
}

/**
 * Log a warning to the console (always shown)
 */
export function warn(message: string, ...args: any[]): void {
  console.warn(`⚠️ WARNING: ${message}`, ...args);
}

/**
 * Log an error with context information
 */
export function error(context: string, error: any): void {
  console.error(`❌ ERROR in ${context}:`, error);
}

/**
 * Handle an error with context information
 * @param context The context where the error occurred
 * @param error The error object
 * @param fallback Optional fallback function to execute
 */
export function handleError(context: string, error: any, fallback?: () => void): void {
  error(context, error);
  
  if (fallback) {
    try {
      fallback();
    } catch (fallbackError) {
      console.error(`Failed to execute fallback for ${context}:`, fallbackError);
    }
  }
}

/**
 * Create a try-catch wrapper for a function
 * @param fn The function to wrap
 * @param context The context for error reporting
 * @returns A wrapped function that catches errors
 */
export function withErrorHandling<T extends (...args: any[]) => any>(
  fn: T,
  context: string
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  return (...args: Parameters<T>): ReturnType<T> | undefined => {
    try {
      return fn(...args);
    } catch (err) {
      error(context, err);
      return undefined;
    }
  };
} 
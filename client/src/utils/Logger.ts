/**
 * Logger utility for standardized logging and error handling
 */

// Explicitly set to false for production
export const DEBUG_MODE = false;

// Log levels
export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4
}

// Current log level - can be controlled via environment variable
export const CURRENT_LOG_LEVEL: LogLevel = DEBUG_MODE 
  ? LogLevel.DEBUG
  : (process.env.REACT_APP_LOG_LEVEL 
      ? parseInt(process.env.REACT_APP_LOG_LEVEL) 
      : LogLevel.ERROR);

/**
 * Log a debug message (only in debug mode or if log level is DEBUG)
 */
export function debug(...args: any[]): void {
  if (CURRENT_LOG_LEVEL >= LogLevel.DEBUG) {
    console.log('🐞 DEBUG:', ...args);
  }
}

/**
 * Log an info message (only if log level is INFO or higher)
 */
export function info(...args: any[]): void {
  if (CURRENT_LOG_LEVEL >= LogLevel.INFO) {
    console.log('ℹ️ INFO:', ...args);
  }
}

/**
 * Log a warning message (only if log level is WARN or higher)
 */
export function warn(message: string, ...args: any[]): void {
  if (CURRENT_LOG_LEVEL >= LogLevel.WARN) {
    console.warn('⚠️ WARNING:', message, ...args);
  }
}

/**
 * Log an error message (always shown unless log level is NONE)
 */
export function error(context: string, error: any): void {
  if (CURRENT_LOG_LEVEL >= LogLevel.ERROR) {
    console.error(`❌ ERROR in ${context}:`, error);
  }
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
      error(`Failed to execute fallback for ${context}`, fallbackError);
    }
  }
}

/**
 * For legacy compatibility - equivalent to debug
 */
export function log(...args: any[]): void {
  debug(...args);
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
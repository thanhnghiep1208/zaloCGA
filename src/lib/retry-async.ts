export async function retryAsync<T>(
  fn: () => Promise<T>,
  attempts: number,
  opts?: { isFatal?: (error: unknown) => boolean }
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (opts?.isFatal?.(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

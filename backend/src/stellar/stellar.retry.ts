const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type WaitFunction = (ms: number) => Promise<void>;

export function getErrorStatus(error: unknown): number | undefined {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'status' in error.response &&
    typeof error.response.status === 'number'
  ) {
    return error.response.status;
  }

  return undefined;
}

export async function retryStellarRequest<T>(
  operation: () => Promise<T>,
  wait: WaitFunction = sleep,
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      const status = getErrorStatus(error);
      if (
        (status !== 503 && status !== 504) ||
        attempt >= RETRY_DELAYS_MS.length
      ) {
        throw error;
      }

      await wait(RETRY_DELAYS_MS[attempt]);
      attempt += 1;
    }
  }
}

/** Serializes asynchronous tasks by key without blocking different keys. */
const tails = new Map<string, Promise<void>>();

export async function withKeyedSerialLock<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(key);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous ? previous.then(() => gate) : gate;
  tails.set(key, tail);

  if (previous) await previous;
  try {
    return await operation();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

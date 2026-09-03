export async function mapWithConcurrency<Input, Output>(
  values: readonly Input[],
  limit: number,
  mapper: (value: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RangeError("concurrency limit must be a positive integer");
  }
  const results = new Array<Output>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      if (value !== undefined) results[index] = await mapper(value, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return results;
}

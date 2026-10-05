import { describe, expect, it, vi } from 'vitest';
import { startAsyncTransition } from './start-async-transition';

describe('startAsyncTransition', () => {
  it('hands React the promise, so the transition stays pending until it settles', async () => {
    let returned: unknown;
    let settled = false;
    const startTransition = (cb: () => void) => {
      returned = (cb as () => unknown)();
    };
    startAsyncTransition(startTransition, async () => {
      await Promise.resolve();
      settled = true;
    });
    expect(returned).toBeInstanceOf(Promise);
    expect(settled).toBe(false);
    await returned;
    expect(settled).toBe(true);
  });

  it('logs a rejection instead of letting it reach the error boundary', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let returned: unknown;
    startAsyncTransition(
      (cb) => {
        returned = (cb as () => unknown)();
      },
      async () => {
        throw new Error('boom');
      },
    );
    await expect(returned).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

/**
 * Run an async callback inside a React transition.
 *
 * React 18's `startTransition` is typed `(cb: () => void) => void`, so passing
 * `async () => { ... }` is a type error — and at runtime React never tracked
 * work past the callback's first `await` anyway, so the async form was already
 * only scheduling the update, not awaiting it.
 *
 * This preserves exactly that runtime behaviour while satisfying the types:
 * the transition wraps the synchronous kick-off, the promise runs on its own.
 *
 * @param startTransition the `startTransition` from `useTransition()`
 * @param fn the async work to kick off inside the transition
 */
export function startAsyncTransition(
  startTransition: (callback: () => void) => void,
  fn: () => Promise<unknown>,
): void {
  startTransition(() => {
    void fn();
  });
}

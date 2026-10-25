/**
 * Run an async callback inside a React transition, and keep `isPending` true
 * until it settles.
 *
 * React 18's `startTransition` is typed `(cb: () => void) => void`, so an
 * `async` callback does not typecheck directly. But the React the App Router
 * bundles is a canary with async actions on (`enableAsyncActions`): a promise
 * returned from the callback is tracked, and `isPending` stays true until it
 * settles. Every caller leans on that pending flag to disable its button.
 *
 * This used to wrap the call as `() => { void fn(); }`, which handed React
 * `undefined` — the transition ended at once, `isPending` flickered, and a
 * second click could create a second listing / toggle twice.
 *
 * Rejections are caught here and logged: thrown out of a tracked action they
 * would reach the error boundary, where before they were an unhandled
 * rejection and the page stayed up.
 *
 * @param startTransition the `startTransition` from `useTransition()`
 * @param fn the async work to run inside the transition
 */
export function startAsyncTransition(
  startTransition: (callback: () => void) => void,
  fn: () => Promise<unknown>,
): void {
  startTransition(() =>
    fn().catch((err: unknown) => {
      console.error('[startAsyncTransition]', err);
    }),
  );
}

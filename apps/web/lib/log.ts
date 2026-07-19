/**
 * Tiny logger. console.log is forbidden in production code paths (see CLAUDE.md
 * §6). Use this instead.
 *
 * In dev (NODE_ENV !== 'production'): writes to console.
 * In prod: info/debug are no-ops; warn/error still write.
 *
 * For PII: never log full email/phone/address. Use mask().
 */

const isProd = process.env.NODE_ENV === 'production';

type LogArgs = unknown[];

export const logger = {
  debug: (...args: LogArgs) => {
    if (!isProd) console.debug('[debug]', ...args);
  },
  info: (...args: LogArgs) => {
    if (!isProd) console.info('[info]', ...args);
  },
  warn: (...args: LogArgs) => {
    console.warn('[warn]', ...args);
  },
  error: (...args: LogArgs) => {
    console.error('[error]', ...args);
  },
};

/** Mask PII for logs: keeps a hint for grep, drops the rest. */
export function mask(value: string | null | undefined): string {
  if (!value) return '<empty>';
  if (value.length <= 4) return '***';
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

import pino from 'pino';

export type Logger = pino.Logger;

/**
 * Anything that could identify a person is redacted at the logger, not at each call site, so a
 * careless `log.info({ body })` cannot leak. We also never log query strings (search terms and
 * locations can be personal) or request bodies (CV text, e-mail addresses).
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-internal-token"]',
  'res.headers["set-cookie"]',
  '*.email',
  '*.otp',
  '*.password',
  '*.token',
  '*.apiKey',
  'email',
  'otp',
  'token',
  'apiKey',
  'cvText',
  'profile',
];

export interface LoggerOptions {
  level: string;
  pretty?: boolean;
  destination?: pino.DestinationStream;
}

export function createLogger(options: LoggerOptions): Logger {
  const base: pino.LoggerOptions = {
    level: options.level,
    base: { service: 'unneet-api' },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  };
  if (options.destination) return pino(base, options.destination);
  if (options.pretty) {
    return pino({
      ...base,
      transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
    });
  }
  return pino(base);
}

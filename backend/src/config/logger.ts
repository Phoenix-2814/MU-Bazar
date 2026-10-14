const safeEventPattern = /^[a-z0-9_]{1,80}$/;

export const logError = (event: string, error: unknown): void => {
  const eventName = safeEventPattern.test(event) ? event : 'application_error';
  const errorType = error instanceof Error ? error.name : typeof error;
  console.error(JSON.stringify({ level: 'error', event: eventName, errorType }));
};

export const logInfo = (event: string, fields: Record<string, string | number | boolean> = {}): void => {
  const eventName = safeEventPattern.test(event) ? event : 'application_event';
  console.info(JSON.stringify({ level: 'info', event: eventName, ...fields }));
};

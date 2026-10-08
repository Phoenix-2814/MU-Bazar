const isProduction = process.env.NODE_ENV === 'production';

export const clientOrigins = (process.env.CLIENT_ORIGIN || (isProduction ? '' : 'http://localhost:3000'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const publicApiUrl = (process.env.PUBLIC_API_URL || (isProduction ? '' : 'http://localhost:5000'))
  .replace(/\/+$/, '');

export const validateDeploymentConfig = (): void => {
  if (isProduction && clientOrigins.length === 0) {
    throw new Error('CLIENT_ORIGIN must be configured in production.');
  }
  if (isProduction && !publicApiUrl) {
    throw new Error('PUBLIC_API_URL must be configured in production.');
  }
  if (
    isProduction &&
    (!process.env.SMTP_HOST ||
      !process.env.SMTP_USER ||
      !process.env.SMTP_PASS ||
      !process.env.SMTP_FROM ||
      !process.env.FRONTEND_URL)
  ) {
    throw new Error('SMTP settings and FRONTEND_URL must be configured in production.');
  }
};

import nodemailer from 'nodemailer';

interface VerificationEmail {
  email: string;
  token: string;
}

interface EmailMessage {
  email: string;
  subject: string;
  text: string;
  html: string;
}

const createFrontendUrl = (parameter: string, token: string): string => {
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) {
    throw new Error('FRONTEND_URL must be configured.');
  }

  const url = new URL('/', frontendUrl);
  url.searchParams.set(parameter, token);
  return url.toString();
};

const sendWithBrevo = async ({ email, subject, text, html }: EmailMessage): Promise<void> => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.EMAIL_FROM;
  const senderName = process.env.EMAIL_FROM_NAME || 'MU Bazar';

  if (!apiKey || !senderEmail) {
    throw new Error('BREVO_API_KEY and EMAIL_FROM must be configured when EMAIL_PROVIDER=brevo.');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });

  if (!response.ok) {
    const responseDetails = (await response.text()).slice(0, 500);
    throw new Error(`Brevo rejected the email (HTTP ${response.status}): ${responseDetails}`);
  }
};

const sendEmail = async (message: EmailMessage): Promise<void> => {
  if ((process.env.EMAIL_PROVIDER || 'smtp').toLowerCase() === 'brevo') {
    await sendWithBrevo(message);
    return;
  }

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass || !from) {
    throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM must be configured.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: message.email,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
};

export const sendVerificationEmail = async ({ email, token }: VerificationEmail): Promise<void> => {
  const verificationUrl = createFrontendUrl('verifyEmail', token);
  await sendEmail({
    email,
    subject: 'Verify your MU Bazar email',
    text: `Verify your MU Bazar account using this link: ${verificationUrl}\nThis link expires in 24 hours.`,
    html: `<p>Verify your MU Bazar account by clicking the link below. This link expires in 24 hours.</p><p><a href="${verificationUrl}">Verify email address</a></p>`,
  });
};

export const sendPasswordResetEmail = async ({ email, token }: VerificationEmail): Promise<void> => {
  const resetUrl = createFrontendUrl('resetPassword', token);
  await sendEmail({
    email,
    subject: 'Reset your MU Bazar password',
    text: `Reset your MU Bazar password using this link: ${resetUrl}\nThis link expires in one hour. If you did not request a reset, you can ignore this email.`,
    html: `<p>Reset your MU Bazar password by clicking the link below. This link expires in one hour.</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request a reset, you can ignore this email.</p>`,
  });
};

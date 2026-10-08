import nodemailer from 'nodemailer';

interface VerificationEmail {
  email: string;
  token: string;
}

export const sendVerificationEmail = async ({ email, token }: VerificationEmail): Promise<void> => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  const frontendUrl = process.env.FRONTEND_URL;

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass || !from || !frontendUrl) {
    throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, and FRONTEND_URL must be configured.');
  }

  const verificationUrl = new URL('/', frontendUrl);
  verificationUrl.searchParams.set('verifyEmail', token);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: email,
    subject: 'Verify your MU Bazar email',
    text: `Verify your MU Bazar account using this link: ${verificationUrl.toString()}\nThis link expires in 24 hours.`,
    html: `<p>Verify your MU Bazar account by clicking the link below. This link expires in 24 hours.</p><p><a href="${verificationUrl.toString()}">Verify email address</a></p>`,
  });
};

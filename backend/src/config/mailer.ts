import nodemailer from 'nodemailer';

interface VerificationEmail {
  email: string;
  token: string;
}

const createVerificationUrl = (token: string): string => {
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) {
    throw new Error('FRONTEND_URL must be configured.');
  }

  const verificationUrl = new URL('/', frontendUrl);
  verificationUrl.searchParams.set('verifyEmail', token);
  return verificationUrl.toString();
};

const sendWithBrevo = async (email: string, verificationUrl: string): Promise<void> => {
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
      subject: 'Verify your MU Bazar email',
      textContent: `Verify your MU Bazar account using this link: ${verificationUrl}\nThis link expires in 24 hours.`,
      htmlContent: `<p>Verify your MU Bazar account by clicking the link below. This link expires in 24 hours.</p><p><a href="${verificationUrl}">Verify email address</a></p>`,
    }),
  });

  if (!response.ok) {
    const responseDetails = (await response.text()).slice(0, 500);
    throw new Error(`Brevo rejected the verification email (HTTP ${response.status}): ${responseDetails}`);
  }
};

export const sendVerificationEmail = async ({ email, token }: VerificationEmail): Promise<void> => {
  const verificationUrl = createVerificationUrl(token);
  if ((process.env.EMAIL_PROVIDER || 'smtp').toLowerCase() === 'brevo') {
    await sendWithBrevo(email, verificationUrl);
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
    to: email,
    subject: 'Verify your MU Bazar email',
    text: `Verify your MU Bazar account using this link: ${verificationUrl.toString()}\nThis link expires in 24 hours.`,
    html: `<p>Verify your MU Bazar account by clicking the link below. This link expires in 24 hours.</p><p><a href="${verificationUrl.toString()}">Verify email address</a></p>`,
  });
};

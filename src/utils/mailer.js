const nodemailer = require("nodemailer");

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error("SMTP credentials are not configured");
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
  });

  return transporter;
};

const sendMail = async ({ to, subject, text, html }) => {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await getTransporter().sendMail({
    from,
    to,
    subject,
    text,
    html,
  });
};

module.exports = { sendMail };

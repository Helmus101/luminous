import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: 'tjong.willem@gmail.com',
    pass: process.env.SMTP_PASS // User needs to set this
  }
});

export async function sendOutreachEmail({ to, candidateName, userName }) {
  const mailOptions = {
    from: '"Willem Tjong via Luminous" <tjong.willem@gmail.com>',
    to,
    subject: `Quick question from ${userName}`,
    text: `Hi ${candidateName},\n\nI'm reaching out on behalf of ${userName} who is interested in connecting with you via Luminous. They mentioned: "Specifically looking to understand your experience in AI safety."\n\nAre you open to a brief intro? Reply 'Yes' and I will connect you both.\n\nBest,\nLuminous Helper`,
  };

  return transporter.sendMail(mailOptions);
}

export async function sendJointIntroEmail({ userEmail, candidateEmail, userName, candidateName }) {
  const mailOptions = {
    from: '"Luminous Warm Intro" <tjong.willem@gmail.com>',
    to: `${userEmail}, ${candidateEmail}`,
    subject: `Intro: ${userName} <> ${candidateName}`,
    text: `Hi ${userName} and ${candidateName},\n\nGreat to connect you both! ${candidateName} is open to chatting about AI safety. I'll leave it to you two to take it from here.\n\nCheers,\nLuminous`,
  };

  return transporter.sendMail(mailOptions);
}

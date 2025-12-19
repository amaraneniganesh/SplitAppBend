const nodemailer = require('nodemailer');

// 1. SETUP TRANSPORTER
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// 2. MODERN UI TEMPLATE (Fixed with Tables)
const getBaseTemplate = (previewText, bodyContent) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; margin: 0; padding: 0; color: #1a1a1a; }
    .wrapper { width: 100%; background-color: #f5f5f7; padding: 40px 0; }
    .container { max-width: 460px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.04); }
    
    /* Header */
    .header { padding: 30px 40px; text-align: center; border-bottom: 1px solid #f0f0f0; }
    .logo { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #000000; text-decoration: none; }
    
    /* Content */
    .content { padding: 40px; text-align: center; }
    h1 { margin: 0 0 10px 0; font-size: 24px; font-weight: 700; color: #000; }
    p { margin: 0 0 24px 0; font-size: 15px; line-height: 1.5; color: #666; }
    
    /* Receipt Table (The Fix) */
    .receipt { background: #fafafa; border: 1px solid #eaeaea; border-radius: 16px; padding: 24px; text-align: left; margin-top: 10px; width: 100%; box-sizing: border-box; }
    .receipt-label { font-size: 11px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 4px; display: block; }
    .receipt-amount { font-size: 32px; font-weight: 700; letter-spacing: -1px; margin-bottom: 20px; color: #000; display: block; }
    .receipt-divider { height: 1px; background-color: #eaeaea; margin: 16px 0; border: none; width: 100%; }
    
    /* Table Styles */
    .receipt-table { width: 100%; border-collapse: collapse; }
    .receipt-table td { padding: 6px 0; font-size: 14px; vertical-align: top; }
    .row-key { color: #666; width: 40%; }
    .row-val { color: #000; font-weight: 600; text-align: right; width: 60%; }

    /* OTP Code */
    .otp-code { font-family: 'SF Mono', 'Menlo', monospace; font-size: 36px; font-weight: 700; letter-spacing: 4px; color: #000; background: #f5f5f7; padding: 24px; border-radius: 12px; margin: 24px 0; display: inline-block; width: 80%; }
    
    /* Button */
    .btn { display: inline-block; background-color: #000000; color: #ffffff; padding: 16px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px; margin-top: 20px; }
    
    /* Footer */
    .footer { padding: 30px; text-align: center; font-size: 12px; color: #999; background-color: #f5f5f7; }
    .footer a { color: #666; text-decoration: none; margin: 0 8px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header"><span class="logo">SplitApp.</span></div>
      <div class="content">${bodyContent}</div>
      <div class="footer"><p style="margin: 0;">Secured by SplitApp Inc.</p></div>
    </div>
  </div>
</body>
</html>
`;

// 3. SEND OTP EMAIL
exports.sendOTPEmail = async (email, otp, username) => {
  const content = `
    <h1>Verify your email</h1>
    <p>Hi ${username}, use this code to sign in.</p>
    <div class="otp-code">${otp}</div>
    <p style="font-size: 12px; color: #888; margin-top: 0;">This code expires in 10 minutes.</p>
  `;
  await transporter.sendMail({ from: '"SplitApp" <no-reply@splitapp.com>', to: email, subject: `Your code is ${otp}`, html: getBaseTemplate('Verify Email', content) });
};

// 4. SEND TRANSACTION ALERTS (Fixed Spacing)
exports.sendTransactionEmail = async (email, username, type, data) => {
  let content = '';
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  
  const redText = 'color: #ef4444;';
  const greenText = 'color: #10b981;';
  const blueText = 'color: #2563eb;';

  if (type === 'OWE') {
    content = `
      <h1>New Expense</h1>
      <p><b>${data.payerName}</b> paid for <b>${data.description}</b>.</p>
      <div class="receipt">
        <span class="receipt-label">Your Share</span>
        <span class="receipt-amount" style="${redText}">₹${data.amount}</span>
        <div class="receipt-divider"></div>
        <table class="receipt-table">
          <tr><td class="row-key">Group</td><td class="row-val">${data.groupName}</td></tr>
          <tr><td class="row-key">Paid By</td><td class="row-val">${data.payerName}</td></tr>
          <tr><td class="row-key">Date</td><td class="row-val">${date}</td></tr>
        </table>
      </div>
      <a href="#" class="btn">View Expense</a>
    `;
  } else if (type === 'PAID') {
    content = `
      <h1>Expense Added</h1>
      <p>You added a new expense to <b>${data.groupName}</b>.</p>
      <div class="receipt">
        <span class="receipt-label">Total Paid</span>
        <span class="receipt-amount">₹${data.totalAmount}</span>
        <div class="receipt-divider"></div>
        <table class="receipt-table">
          <tr><td class="row-key">Item</td><td class="row-val">${data.description}</td></tr>
          <tr><td class="row-key">Date</td><td class="row-val">${date}</td></tr>
        </table>
      </div>
      <a href="#" class="btn">Open App</a>
    `;
  } else if (type === 'SETTLEMENT_RECEIVED') {
    content = `
      <h1>Payment Received</h1>
      <p><b>${data.payerName}</b> settled up with you.</p>
      <div class="receipt" style="background-color: #f0fdf4; border-color: #dcfce7;">
        <span class="receipt-label" style="color: #166534;">Amount Received</span>
        <span class="receipt-amount" style="${greenText}">+ ₹${data.amount}</span>
        <div class="receipt-divider" style="background-color: #dcfce7;"></div>
        <table class="receipt-table">
           <tr><td class="row-key" style="color: #166534;">From</td><td class="row-val">${data.payerName}</td></tr>
        </table>
      </div>
    `;
  } else if (type === 'SETTLEMENT_SENT') {
    content = `
      <h1>Payment Sent</h1>
      <p>You paid <b>${data.receiverName}</b>.</p>
      <div class="receipt">
        <span class="receipt-label">Amount Paid</span>
        <span class="receipt-amount" style="${blueText}">- ₹${data.amount}</span>
        <div class="receipt-divider"></div>
        <table class="receipt-table">
           <tr><td class="row-key">To</td><td class="row-val">${data.receiverName}</td></tr>
        </table>
      </div>
    `;
  }

  await transporter.sendMail({ from: '"SplitApp Wallet" <no-reply@splitapp.com>', to: email, subject: 'Transaction Alert', html: getBaseTemplate('Transaction', content) });
};

// 5. SEND WELCOME EMAIL (Fixed Spacing)
exports.sendGroupWelcomeEmail = async (email, username, groupName) => {
  const content = `
    <h1>Welcome Aboard! 🚀</h1>
    <p>You've successfully joined <b>${groupName}</b>.</p>
    <div class="receipt">
      <table class="receipt-table">
        <tr><td class="row-key">Group Name</td><td class="row-val">${groupName}</td></tr>
        <tr><td class="row-key" style="padding-top:8px;">Status</td><td class="row-val" style="color: #10b981; padding-top:8px;">Active Member</td></tr>
      </table>
    </div>
    <p style="font-size: 14px; margin-top: 24px;">You can now add expenses and track balances.</p>
    <a href="#" class="btn">Go to Group</a>
  `;
  await transporter.sendMail({ from: '"SplitApp Teams" <no-reply@splitapp.com>', to: email, subject: `You joined ${groupName}`, html: getBaseTemplate('Welcome', content) });
};
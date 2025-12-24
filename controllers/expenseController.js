const Expense = require('../models/Expense');
const User = require('../models/User');
const Group = require('../models/Group');
const Notification = require('../models/Notification'); // <--- IMPORT THIS
const { sendTransactionEmail } = require('../utils/emailService');

// ============================================================
// 1. ADD EXPENSE
// ============================================================
exports.addExpense = async (req, res) => {
  try {
    const { description, amount, payer, group, splitType, splitData } = req.body;

    if (!group) return res.status(400).json({ error: "Group ID is required" });

    const formattedSplits = splitData.map(split => ({
      user: split.userId,
      amount: split.amount,
      percent: split.percent
    }));

    const newExpense = await Expense.create({
      description, 
      amount, 
      payer, 
      group, 
      splitType, 
      splits: formattedSplits
    });

    // --- NOTIFICATION & EMAIL LOGIC (IMMEDIATE) ---
    try {
        const payerUser = await User.findById(payer);
        const groupDetails = await Group.findById(group);

        // 1. Email Payer (Confirmation)
        if (payerUser) {
            sendTransactionEmail(payerUser.email, payerUser.username, 'PAID', {
                groupName: groupDetails.name,
                description,
                totalAmount: amount
            }).catch(err => console.error("Email error:", err));
        }

        // 2. Process Debtors (Email + Website Notification)
        const notificationPromises = [];
        
        splitData.forEach(split => {
            if (split.userId !== payer) {
                // A. Send Email Asynchronously
                User.findById(split.userId).then(debtor => {
                    if (debtor) {
                        sendTransactionEmail(debtor.email, debtor.username, 'OWE', {
                            groupName: groupDetails.name,
                            payerName: payerUser.username,
                            description,
                            amount: split.amount.toFixed(2)
                        }).catch(e => console.log(e));
                    }
                });

                // B. Create Database Notification (For Website Inbox)
                notificationPromises.push({
                    recipient: split.userId,
                    sender: payer,
                    type: 'EXPENSE_ADDED', // New Type
                    group: group,
                    message: `${payerUser.username} added "${description}" in ${groupDetails.name}`,
                    status: 'unread' // Just meant to be seen
                });
            }
        });
        
        if (notificationPromises.length > 0) {
            await Notification.insertMany(notificationPromises);
        }

    } catch (notifErr) {
        console.warn("Notification/Email service warning:", notifErr.message);
    }
    // -------------------

    res.status(201).json(newExpense);
  } catch (err) {
    console.error("Add Expense Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// 2. SETTLE DEBT
// ============================================================
exports.settleDebt = async (req, res) => {
  try {
    const { payer, receiver, amount, group } = req.body;
    
    if (!group) return res.status(400).json({ error: "Settlement must belong to a group" });

    const formattedSplits = [{ user: receiver, amount: amount }];

    const settlement = await Expense.create({
      description: "Settlement",
      amount, 
      payer, 
      group, 
      splitType: 'EXACT', 
      splits: formattedSplits,
      isSettled: true 
    });

    // --- NOTIFICATION & EMAIL LOGIC (IMMEDIATE) ---
    try {
        const payerUser = await User.findById(payer);
        const receiverUser = await User.findById(receiver);
        const groupDetails = await Group.findById(group);

        if (receiverUser && payerUser) {
            // 1. Email Logic
            sendTransactionEmail(receiverUser.email, receiverUser.username, 'SETTLEMENT_RECEIVED', {
                payerName: payerUser.username,
                amount
            }).catch(e => console.log(e));

            sendTransactionEmail(payerUser.email, payerUser.username, 'SETTLEMENT_SENT', {
                receiverName: receiverUser.username,
                amount
            }).catch(e => console.log(e));

            // 2. Database Notification for Receiver (Website Inbox)
            await Notification.create({
                recipient: receiver,
                sender: payer,
                type: 'SETTLEMENT', // New Type
                group: group,
                message: `${payerUser.username} settled ₹${amount} with you in ${groupDetails.name}`,
                status: 'unread'
            });
        }
    } catch (e) {
        console.warn("Email warning:", e.message);
    }
    // -------------------

    res.status(201).json(settlement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// ... rest of the file stays the same

// ============================================================
// 3. GET USER BALANCE (Global Calculation)
// ============================================================
exports.getUserBalance = async (req, res) => {
  try {
    const userId = req.params.userId;
    const expenses = await Expense.find({
      $or: [{ payer: userId }, { "splits.user": userId }]
    }).populate('payer', 'username').populate('splits.user', 'username');

    let balanceSheet = {};

    expenses.forEach(exp => {
      if (!exp.payer || !exp.splits) return; 
      const payerId = exp.payer._id.toString();
      
      exp.splits.forEach(split => {
        if (!split.user) return; 
        const debtorId = split.user._id.toString();
        
        // Skip self-splits
        if (payerId === debtorId) return;

        // I Paid, They Owe Me
        if (payerId === userId) {
           balanceSheet[debtorId] = (balanceSheet[debtorId] || 0) + split.amount;
        }
        // They Paid, I Owe Them
        if (debtorId === userId) {
           balanceSheet[payerId] = (balanceSheet[payerId] || 0) - split.amount;
        }
      });
    });

    let oweList = [];
    let owedList = [];
    
    // Resolve User Names
    const friendIds = Object.keys(balanceSheet);
    const friends = await User.find({ _id: { $in: friendIds } });
    const friendMap = friends.reduce((acc, user) => ({...acc, [user._id]: user.username}), {});

    for (const [friendId, amount] of Object.entries(balanceSheet)) {
      if (Math.abs(amount) < 1) continue; // Ignore negligible amounts
      
      if (amount > 0) {
        owedList.push({ id: friendId, username: friendMap[friendId] || 'Unknown', amount: amount.toFixed(2) });
      } else {
        oweList.push({ id: friendId, username: friendMap[friendId] || 'Unknown', amount: Math.abs(amount).toFixed(2) });
      }
    }
    res.json({ oweList, owedList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// 4. GET GROUP EXPENSES (Strict Filtering)
// ============================================================
exports.getGroupExpenses = async (req, res) => {
  try {
    // Strictly filter by group ID to prevent "Ghost Data" from other groups
    const expenses = await Expense.find({ group: req.params.groupId })
      .populate('payer', 'username')
      .populate('splits.user', 'username')
      .sort({ createdAt: -1 });
    res.json(expenses);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ============================================================
// 5. GET TRANSACTION HISTORY
// ============================================================
exports.getUserTransactionHistory = async (req, res) => {
  try {
    const userId = req.params.userId;
    const expenses = await Expense.find({
      $or: [ { payer: userId }, { "splits.user": userId } ]
    })
    .populate('payer', 'username')
    .populate('splits.user', 'username')
    .populate('group', 'name')
    .sort({ createdAt: -1 });
    
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
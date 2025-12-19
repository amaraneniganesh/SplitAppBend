const Expense = require('../models/Expense');
const User = require('../models/User');
const Group = require('../models/Group');
const { sendTransactionEmail } = require('../utils/emailService');

// 1. ADD EXPENSE
exports.addExpense = async (req, res) => {
  try {
    const { description, amount, payer, group, splitType, splitData } = req.body;

    const formattedSplits = splitData.map(split => ({
      user: split.userId,
      amount: split.amount,
      percent: split.percent
    }));

    const newExpense = await Expense.create({
      description, amount, payer, group, splitType, splits: formattedSplits
    });

    // --- EMAIL LOGIC ---
    const payerUser = await User.findById(payer);
    const groupDetails = await Group.findById(group);

    // 1. Email Payer
    if (payerUser) {
        sendTransactionEmail(payerUser.email, payerUser.username, 'PAID', {
            groupName: groupDetails.name,
            description,
            totalAmount: amount
        }).catch(err => console.error("Email error:", err));
    }

    // 2. Email Debtors
    const debtorPromises = splitData.map(async (split) => {
        if (split.userId !== payer) {
            const debtor = await User.findById(split.userId);
            if (debtor) {
                return sendTransactionEmail(debtor.email, debtor.username, 'OWE', {
                    groupName: groupDetails.name,
                    payerName: payerUser.username,
                    description,
                    amount: split.amount.toFixed(2)
                });
            }
        }
    });
    
    Promise.allSettled(debtorPromises).catch(err => console.error("Email error:", err));
    // -------------------

    res.status(201).json(newExpense);
  } catch (err) {
    console.error("Add Expense Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// 2. SETTLE DEBT
exports.settleDebt = async (req, res) => {
  try {
    const { payer, receiver, amount, group } = req.body;
    
    const formattedSplits = [{ user: receiver, amount: amount }];

    const settlement = await Expense.create({
      description: "Settlement",
      amount, payer, group, splitType: 'EXACT', splits: formattedSplits
    });

    // --- EMAIL LOGIC ---
    const payerUser = await User.findById(payer);
    const receiverUser = await User.findById(receiver);

    if (receiverUser && payerUser) {
        // Notify Receiver
        sendTransactionEmail(receiverUser.email, receiverUser.username, 'SETTLEMENT_RECEIVED', {
            payerName: payerUser.username,
            amount
        }).catch(e => console.log(e));

        // Notify Payer
        sendTransactionEmail(payerUser.email, payerUser.username, 'SETTLEMENT_SENT', {
            receiverName: receiverUser.username,
            amount
        }).catch(e => console.log(e));
    }
    // -------------------

    res.status(201).json(settlement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// 3. GET USER BALANCE
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
        if (payerId === debtorId) return;

        if (payerId === userId) {
           balanceSheet[debtorId] = (balanceSheet[debtorId] || 0) + split.amount;
        }
        if (debtorId === userId) {
           balanceSheet[payerId] = (balanceSheet[payerId] || 0) - split.amount;
        }
      });
    });

    let oweList = [];
    let owedList = [];
    const friendIds = Object.keys(balanceSheet);
    const friends = await User.find({ _id: { $in: friendIds } });
    const friendMap = friends.reduce((acc, user) => ({...acc, [user._id]: user.username}), {});

    for (const [friendId, amount] of Object.entries(balanceSheet)) {
      if (Math.abs(amount) < 1) continue; 
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

// 4. GET GROUP EXPENSES
exports.getGroupExpenses = async (req, res) => {
  try {
    const expenses = await Expense.find({ group: req.params.groupId })
      .populate('payer', 'username')
      .populate('splits.user', 'username')
      .sort({ createdAt: -1 });
    res.json(expenses);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// 5. GET HISTORY
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
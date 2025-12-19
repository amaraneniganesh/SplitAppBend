const express = require('express');
const router = express.Router();
const { 
  getUserBalance, 
  addExpense, 
  getGroupExpenses, 
  settleDebt,
  getUserTransactionHistory // <--- Import the new function
} = require('../controllers/expenseController');

router.get('/balance/:userId', getUserBalance);
router.post('/add', addExpense);
router.get('/group/:groupId', getGroupExpenses);
router.post('/settle', settleDebt);
router.get('/history/:userId', getUserTransactionHistory); // <--- Add this route

module.exports = router;
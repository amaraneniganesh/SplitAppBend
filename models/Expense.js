const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema({
  description: { type: String, required: true },
  amount: { type: Number, required: true },
  payer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  splitType: { type: String, enum: ['EQUAL', 'EXACT', 'PERCENTAGE'], required: true },
  splits: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: { type: Number },
    percent: { type: Number }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Expense', ExpenseSchema);
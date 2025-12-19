const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, // <--- Enforces unique username
    trim: true    // <--- Removes spaces from start/end
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, // <--- Enforces unique email
    trim: true,
    lowercase: true // <--- Good practice for emails
  },
  phone: { type: String },
  password: { type: String, required: true },
  
  // OTP Fields
  otp: { type: String },
  otpExpires: { type: Date },
  isVerified: { type: Boolean, default: false } 
});

module.exports = mongoose.model('User', UserSchema);
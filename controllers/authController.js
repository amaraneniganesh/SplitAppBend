const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendOTPEmail } = require('../utils/emailService');

// Helper: Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// ==========================================
// 1. REGISTER (Generates OTP)
// ==========================================
exports.registerUser = async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;

    // 1. Check if Email already exists
    let existingEmail = await User.findOne({ email });
    
    // If user exists AND is verified -> Block registration
    if (existingEmail && existingEmail.isVerified) {
      return res.status(400).json({ message: "This Email is already registered. Please Login." });
    }

    // 2. Check if Username already exists (Only check if we are creating a new verified user context)
    // We check against ALL users because usernames must be globally unique
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
        // If the username belongs to someone else (not the current unverified email holder)
        if (!existingEmail || existingUsername._id.toString() !== existingEmail._id.toString()) {
            return res.status(400).json({ message: "This Username is unavailable. Please try another." });
        }
    }

    // 3. Prepare Data
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // 4. Update or Create User
    if (existingEmail && !existingEmail.isVerified) {
      // User tried to register before but never verified -> Overwrite details
      existingEmail.username = username;
      existingEmail.phone = phone;
      existingEmail.password = hashedPassword;
      existingEmail.otp = otp;
      existingEmail.otpExpires = otpExpires;
      await existingEmail.save();
    } else {
      // Completely new user
      const newUser = new User({
        username,
        email,
        phone,
        password: hashedPassword,
        otp,
        otpExpires,
        isVerified: false
      });
      await newUser.save();
    }

    // 5. Send OTP Email
    try {
      await sendOTPEmail(email, otp, username);
    } catch (emailErr) {
      console.error("Email failed:", emailErr);
      // Proceed anyway so user can try resending later if needed
    }

    res.status(201).json({ message: "OTP sent to email" });

  } catch (err) {
    console.error("Register Error:", err);
    // Handle MongoDB duplicate key error as fallback
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res.status(400).json({ message: `${field} is already taken.` });
    }
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

// ==========================================
// 2. VERIFY OTP
// ==========================================
exports.verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(400).json({ message: "User not found" });

    // Check if OTP matches and is not expired
    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid Code" });
    }
    if (user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "Code Expired. Please register again." });
    }

    // Success: Mark verified and clear OTP
    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    // Generate Token
    const token = generateToken(user._id);

    res.status(200).json({ 
        token, 
        user: { id: user._id, username: user.username, email: user.email } 
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ==========================================
// 3. LOGIN
// ==========================================
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid credentials" }); // Generic message for security

    // Check Verification
    if (!user.isVerified) return res.status(400).json({ message: "Please verify your email first" });

    // Check Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    // Generate Token
    const token = generateToken(user._id);

    res.status(200).json({ 
        token, 
        user: { id: user._id, username: user.username, email: user.email } 
    });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: err.message });
  }
};
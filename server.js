require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const https = require('https'); // Import https for self-ping

// Import Routes
const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const expenseRoutes = require('./routes/expenseRoutes');

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// --- HEALTH CHECK ROUTE (For Self-Ping) ---
app.get('/ping', (req, res) => {
  res.status(200).send('Pong! Server is awake.');
});

// --- REGISTER ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/expenses', expenseRoutes);

// Database Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


const SELF_PING_URL = process.env.SELF_PING_URL || (process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/ping` : null);
const SELF_PING_INTERVAL = Number(process.env.SELF_PING_INTERVAL_MS || 14 * 60 * 1000);

const keepServerAlive = () => {
  if (!SELF_PING_URL) return; // Skip if URL not configured
  const client = SELF_PING_URL.startsWith('https') ? https : http;
  client
    .get(SELF_PING_URL, (res) => {
      res.resume(); // Discard body to free sockets
      console.log(`Keep-Alive Ping: Status ${res.statusCode}`);
    })
    .on('error', (err) => {
      console.error(`Keep-Alive Error: ${err.message}`);
    });
};
if (process.env.NODE_ENV === 'production') {
  keepServerAlive(); // Fire once on boot
  setInterval(keepServerAlive, SELF_PING_INTERVAL);
}

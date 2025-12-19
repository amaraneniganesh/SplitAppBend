const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Group = require('../models/Group');
const Notification = require('../models/Notification');
const { sendGroupWelcomeEmail } = require('../utils/emailService');

// 1. SEARCH USERS
router.get('/search', async (req, res) => {
  const { query } = req.query;
  if (!query) return res.json([]);
  try {
    const users = await User.find({ username: { $regex: query, $options: 'i' } }).select('username email _id');
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 2. CREATE GROUP
router.post('/create', async (req, res) => {
  const { name, memberIds, creatorId } = req.body;
  try {
    const creator = await User.findById(creatorId);
    
    // Create group - Creator is automatically a member
    const newGroup = await Group.create({ 
        name, 
        members: [creatorId], // Creator joins immediately
        creator: creatorId 
    });

    // Send Invites to others
    if (memberIds && memberIds.length > 0) {
      const notifications = memberIds.map(userId => ({
        recipient: userId,
        sender: creatorId,
        type: 'GROUP_INVITE',
        group: newGroup._id,
        message: `${creator.username} invited you to join "${name}"`,
        status: 'PENDING'
      }));
      await Notification.insertMany(notifications);
    }
    res.status(201).json({ group: newGroup, message: "Group created!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. GET USER GROUPS
router.get('/user/:userId', async (req, res) => {
  try {
    // Find all groups where the user is in the members array
    const groups = await Group.find({ members: req.params.userId })
        .populate('members', 'username email')
        .sort({ createdAt: -1 });
    res.json(groups);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. GET NOTIFICATIONS
router.get('/notifications/:userId', async (req, res) => {
  try {
    const notifs = await Notification.find({ 
        recipient: req.params.userId,
        $or: [{ status: 'PENDING' }, { type: { $ne: 'GROUP_INVITE' } }] 
    })
      .populate('sender', 'username')
      .populate('group', 'name')
      .sort({ createdAt: -1 });
    res.json(notifs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. RESPOND TO NOTIFICATION
router.post('/notifications/respond', async (req, res) => {
  const { notificationId, response } = req.body; // 'ACCEPTED' or 'REJECTED'
  try {
    const notif = await Notification.findById(notificationId).populate('group');
    if (!notif) return res.status(404).json({ error: "Not found" });

    // Handle Info Notifications (Just delete)
    if (notif.type !== 'GROUP_INVITE') {
        await Notification.findByIdAndDelete(notificationId);
        return res.json({ message: "Cleared" });
    }

    // Handle Group Invites
    notif.status = response;
    await notif.save();

    if (response === 'ACCEPTED') {
      // Add User to Group
      await Group.findByIdAndUpdate(notif.group._id, { $addToSet: { members: notif.recipient } });
      
      // Send Welcome Email
      const user = await User.findById(notif.recipient);
      if (user) {
          sendGroupWelcomeEmail(user.email, user.username, notif.group.name)
            .catch(err => console.error("Welcome Email Error:", err));
      }
    }

    res.json({ message: `Invite ${response}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. INVITE MEMBER
router.put('/add-member', async (req, res) => {
  const { groupId, memberId, adminId } = req.body;
  try {
    const group = await Group.findById(groupId);
    const admin = await User.findById(adminId);

    if (group.members.includes(memberId)) return res.status(400).json({ error: "User already in group" });

    await Notification.create({
        recipient: memberId,
        sender: adminId,
        type: 'GROUP_INVITE',
        group: groupId,
        message: `${admin.username} invited you to join "${group.name}"`,
        status: 'PENDING'
    });

    res.json({ message: "Invite sent successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. REMOVE MEMBER
router.put('/remove-member', async (req, res) => {
  const { groupId, memberId } = req.body;
  try {
    const group = await Group.findByIdAndUpdate(groupId, 
        { $pull: { members: memberId } }, 
        { new: true }
    ).populate('members', 'username email');
    res.json(group);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 8. CREATE MANUAL NOTIFICATION?..
router.post('/notifications/create', async (req, res) => {
    try {
      const { userId, message, type, senderId } = req.body;
      await Notification.create({
        recipient: userId, 
        sender: senderId,
        message,
        type: type || 'INFO',
        status: 'PENDING'
      });
      res.status(201).json({ msg: "Sent" });
    } catch (err) { res.status(500).send('Server Error'); }
});

module.exports = router;
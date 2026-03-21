require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
app.use(cors({ origin: 'https://imjahbar.github.io' }));
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error(err));

// Road model
const Road = mongoose.model('roads', new mongoose.Schema({
    name:      { type: String, required: true },
    type:      { type: String },
    lengthKm:  { type: Number },
    holedata:  { type: Array, default: [] },
    createdAt: { type: Date, default: Date.now }
}));

// User model
const User = mongoose.model('users', new mongoose.Schema({
    fullName:     { type: String, required: true },
    email:        { type: String, unique: true, required: true },
    role:         { type: String, enum: ['user', 'maintenance'], default: 'user' },
    passwordHash: { type: String, required: true },
    createdAt:    { type: Date, default: Date.now }
}));

// Register
app.post('/register', async (req, res) => {
    const { fullname, email, password, role} = req.body;
    try {
        const exist = await User.findOne({email: email.toLowerCase().trim()});
        if (exist) {
            return res.json({ success: false, message: 'An account with that email already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = new User({
            fullName: fullname,
            email: email.toLowerCase().trim(),
            passwordHash,
            role
        });
        await user.save();
        res.json({ success: true, message: 'User registered!' });
    } catch (err) {
        res.json({ success: false, message: 'Registration failed. Please try again.' });
    }
});

// Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user){
            return res.json({ success: false, message: 'Incorrect email or password.' });
        }

        const match = await bcrypt.compare(password, user.passwordHash);
        if (match) {
            res.json({ success: true, message: 'Login successful!', role: user.role, fullName: user.fullName });
        } else {
            res.json({ success: false, message: 'Incorrect email or password.' });
        }
    } catch (err) {
        res.json({ success: false, message: 'Login failed. Please try again.' });
    }
});

// Get all road names only (autocomplete)
app.get('/api/roads', async (_req, res) => {
    try {
        const roads = await Road.find({}, 'name');
        res.json({ success: true, roads });
    } catch (err) {
        res.json({ success: false, message: 'Could not load roads.' });
    }
});

// Get all roads with full holedata (for reports and maintenance tab)
app.get('/api/roads/all', async (_req, res) => {
    try {
        const roads = await Road.find({});
        res.json({ success: true, roads });
    } catch (err) {
        res.json({ success: false, message: 'Could not load roads.' });
    }
});

// Add a new road
app.post('/api/roads', async (req, res) => {
    const { name, type, lengthKm } = req.body;
    try {
        const exists = await Road.findOne({ name: new RegExp(`^${name}$`, 'i') });
        if (exists) return res.json({ success: false, message: 'Road already exists.' });
        const road = new Road({ name, type, lengthKm, holedata: [] });
        await road.save();
        res.json({ success: true, message: 'Road added.' });
    } catch (err) {
        res.json({ success: false, message: 'Failed to add road.' });
    }
});

// Get a single road by name (for metrics)
app.get('/api/roads/:name', async (req, res) => {
    try {
        const road = await Road.findOne({ name: new RegExp(`^${req.params.name}$`, 'i') });
        if (!road) return res.json({ success: false, message: 'Road not found.' });
        res.json({ success: true, road });
    } catch (err) {
        res.json({ success: false, message: 'Could not load road data.' });
    }
});

// Push a holedata entry to a road (observation, repair, or resurface)
app.post('/api/roads/:name/holedata', async (req, res) => {
    try {
        const road = await Road.findOne({ name: new RegExp(`^${req.params.name}$`, 'i') });
        if (!road) return res.json({ success: false, message: 'Road not found.' });
        road.holedata.push(req.body);
        await road.save();
        res.json({ success: true, message: 'Entry logged.' });
    } catch (err) {
        res.json({ success: false, message: 'Failed to log entry.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
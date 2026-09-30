const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const authenticate = require("../middleware/auth");

const router = express.Router();

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "30d"
    }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    bio: user.bio,
    isOnline: user.is_online,
    lastSeen: user.last_seen
  };
}

router.post("/register", async (req, res, next) => {
  try {
    const {
      username,
      email,
      password,
      displayName
    } = req.body;

    if (!username || !email || !password || !displayName) {
      return res.status(400).json({
        error: "username, email, password and displayName are required"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters"
      });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanEmail = email.trim().toLowerCase();

    if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
      return res.status(400).json({
        error: "Username must be 3-30 characters and use letters, numbers or underscores"
      });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE username = $1 OR email = $2",
      [cleanUsername, cleanEmail]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: "Username or email is already registered"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users
       (username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, display_name,
                 avatar_url, bio, is_online, last_seen`,
      [
        cleanUsername,
        cleanEmail,
        passwordHash,
        displayName.trim()
      ]
    );

    const user = result.rows[0];

    res.status(201).json({
      user: publicUser(user),
      token: createToken(user)
    });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required"
      });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const user = result.rows[0];

    const valid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!valid) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    await pool.query(
      `UPDATE users
       SET is_online = TRUE,
           last_seen = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [user.id]
    );

    res.json({
      user: publicUser({
        ...user,
        is_online: true
      }),
      token: createToken(user)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, username, email, display_name,
              avatar_url, bio, is_online, last_seen
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    res.json({
      user: publicUser(result.rows[0])
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

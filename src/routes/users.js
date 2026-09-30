const express = require("express");
const pool = require("../db");
const authenticate = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);

router.get("/search", async (req, res, next) => {
  try {
    const q = (req.query.q || "").trim();

    if (q.length < 2) {
      return res.status(400).json({
        error: "Search must contain at least 2 characters"
      });
    }

    const result = await pool.query(
      `SELECT id, username, display_name,
              avatar_url, bio, is_online, last_seen
       FROM users
       WHERE id <> $1
       AND (
         username ILIKE $2
         OR display_name ILIKE $2
       )
       ORDER BY username
       LIMIT 20`,
      [req.user.id, `%${q}%`]
    );

    res.json({
      users: result.rows.map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        isOnline: user.is_online,
        lastSeen: user.last_seen
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, username, display_name,
              avatar_url, bio, is_online, last_seen
       FROM users
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    const user = result.rows[0];

    res.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        bio: user.bio,
        isOnline: user.is_online,
        lastSeen: user.last_seen
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

const express = require("express");
const pool = require("../db");
const authenticate = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);

async function isMember(conversationId, userId) {
  const result = await pool.query(
    `SELECT 1
     FROM conversation_members
     WHERE conversation_id = $1
     AND user_id = $2`,
    [conversationId, userId]
  );

  return result.rows.length > 0;
}

router.get("/:conversationId", async (req, res, next) => {
  try {
    const { conversationId } = req.params;

    if (!(await isMember(conversationId, req.user.id))) {
      return res.status(403).json({
        error: "You are not a member of this conversation"
      });
    }

    const limit = Math.min(
      parseInt(req.query.limit || "50", 10),
      100
    );

    const result = await pool.query(
      `SELECT
         m.id,
         m.conversation_id,
         m.sender_id,
         m.content,
         m.message_type,
         m.delivered_at,
         m.read_at,
         m.created_at,
         u.username,
         u.display_name
       FROM messages m
       INNER JOIN users u
         ON u.id = m.sender_id
       WHERE m.conversation_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2`,
      [conversationId, limit]
    );

    res.json({
      messages: result.rows.reverse()
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:conversationId", async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const { content } = req.body;

    if (!(await isMember(conversationId, req.user.id))) {
      return res.status(403).json({
        error: "You are not a member of this conversation"
      });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({
        error: "Message content is required"
      });
    }

    if (content.length > 5000) {
      return res.status(400).json({
        error: "Message is too long"
      });
    }

    const result = await pool.query(
      `INSERT INTO messages
       (conversation_id, sender_id, content, delivered_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING id, conversation_id, sender_id,
                 content, message_type,
                 delivered_at, read_at, created_at`,
      [
        conversationId,
        req.user.id,
        content.trim()
      ]
    );

    await pool.query(
      `UPDATE conversations
       SET updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [conversationId]
    );

    res.status(201).json({
      message: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:messageId/read", async (req, res, next) => {
  try {
    const { messageId } = req.params;

    const result = await pool.query(
      `UPDATE messages m
       SET read_at = CURRENT_TIMESTAMP
       WHERE m.id = $1
       AND EXISTS (
         SELECT 1
         FROM conversation_members cm
         WHERE cm.conversation_id = m.conversation_id
         AND cm.user_id = $2
       )
       RETURNING m.id, m.conversation_id, m.read_at`,
      [messageId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Message not found"
      });
    }

    res.json({
      message: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

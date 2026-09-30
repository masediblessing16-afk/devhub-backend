const express = require("express");
const pool = require("../db");
const authenticate = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
        c.id,
        c.is_group,
        c.name,
        c.created_at,
        c.updated_at,
        (
          SELECT json_build_object(
            'id', m.id,
            'content', m.content,
            'senderId', m.sender_id,
            'createdAt', m.created_at
          )
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.created_at DESC
          LIMIT 1
        ) AS last_message
       FROM conversations c
       INNER JOIN conversation_members cm
         ON cm.conversation_id = c.id
       WHERE cm.user_id = $1
       ORDER BY c.updated_at DESC`,
      [req.user.id]
    );

    const conversations = [];

    for (const row of result.rows) {
      const members = await pool.query(
        `SELECT u.id, u.username, u.display_name,
                u.avatar_url, u.is_online, u.last_seen
         FROM users u
         INNER JOIN conversation_members cm
           ON cm.user_id = u.id
         WHERE cm.conversation_id = $1`,
        [row.id]
      );

      conversations.push({
        id: row.id,
        isGroup: row.is_group,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastMessage: row.last_message,
        members: members.rows.map((m) => ({
          id: m.id,
          username: m.username,
          displayName: m.display_name,
          avatarUrl: m.avatar_url,
          isOnline: m.is_online,
          lastSeen: m.last_seen
        }))
      });
    }

    res.json({ conversations });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  const client = await pool.connect();

  try {
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({
        error: "participantId is required"
      });
    }

    if (participantId === req.user.id) {
      return res.status(400).json({
        error: "You cannot start a conversation with yourself"
      });
    }

    const userCheck = await client.query(
      "SELECT id FROM users WHERE id = $1",
      [participantId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    const existing = await client.query(
      `SELECT c.id
       FROM conversations c
       JOIN conversation_members cm
         ON cm.conversation_id = c.id
       WHERE c.is_group = FALSE
       GROUP BY c.id
       HAVING COUNT(*) = 2
       AND COUNT(*) FILTER (
         WHERE cm.user_id IN ($1, $2)
       ) = 2
       LIMIT 1`,
      [req.user.id, participantId]
    );

    if (existing.rows.length > 0) {
      return res.json({
        conversationId: existing.rows[0].id,
        existing: true
      });
    }

    await client.query("BEGIN");

    const conversation = await client.query(
      `INSERT INTO conversations
       (is_group, created_by)
       VALUES (FALSE, $1)
       RETURNING id`,
      [req.user.id]
    );

    const conversationId = conversation.rows[0].id;

    await client.query(
      `INSERT INTO conversation_members
       (conversation_id, user_id)
       VALUES ($1, $2), ($1, $3)`,
      [
        conversationId,
        req.user.id,
        participantId
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({
      conversationId,
      existing: false
    });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
});

module.exports = router;

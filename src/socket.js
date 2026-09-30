const jwt = require("jsonwebtoken");
const pool = require("./db");

function setupSocket(io) {
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(
          "Bearer ",
          ""
        );

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET
      );

      socket.user = decoded;

      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.user.id;

    console.log("DEVHUB user connected:", userId);

    try {
      await pool.query(
        `UPDATE users
         SET is_online = TRUE,
             last_seen = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [userId]
      );

      socket.join(`user:${userId}`);
    } catch (error) {
      console.error("Online status error:", error);
    }

    socket.on("join_conversation", async (conversationId) => {
      try {
        const result = await pool.query(
          `SELECT 1
           FROM conversation_members
           WHERE conversation_id = $1
           AND user_id = $2`,
          [conversationId, userId]
        );

        if (result.rows.length === 0) {
          return;
        }

        socket.join(`conversation:${conversationId}`);
      } catch (error) {
        console.error(error);
      }
    });

    socket.on("leave_conversation", (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on("send_message", async (data, callback) => {
      try {
        const {
          conversationId,
          content
        } = data;

        if (!conversationId || !content?.trim()) {
          return callback?.({
            error: "conversationId and content are required"
          });
        }

        const membership = await pool.query(
          `SELECT 1
           FROM conversation_members
           WHERE conversation_id = $1
           AND user_id = $2`,
          [conversationId, userId]
        );

        if (membership.rows.length === 0) {
          return callback?.({
            error: "You are not a member of this conversation"
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
            userId,
            content.trim()
          ]
        );

        await pool.query(
          `UPDATE conversations
           SET updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [conversationId]
        );

        const message = result.rows[0];

        io.to(`conversation:${conversationId}`).emit(
          "new_message",
          message
        );

        callback?.({
          success: true,
          message
        });
      } catch (error) {
        console.error("Socket message error:", error);

        callback?.({
          error: "Could not send message"
        });
      }
    });

    socket.on("typing", (data) => {
      if (!data?.conversationId) return;

      socket
        .to(`conversation:${data.conversationId}`)
        .emit("typing", {
          conversationId: data.conversationId,
          userId,
          isTyping: Boolean(data.isTyping)
        });
    });

    socket.on("mark_read", async (data) => {
      try {
        if (!data?.messageId) return;

        const result = await pool.query(
          `UPDATE messages
           SET read_at = CURRENT_TIMESTAMP
           WHERE id = $1
           AND conversation_id IN (
             SELECT conversation_id
             FROM conversation_members
             WHERE user_id = $2
           )
           RETURNING id, conversation_id, read_at`,
          [data.messageId, userId]
        );

        if (result.rows.length > 0) {
          io.to(
            `conversation:${result.rows[0].conversation_id}`
          ).emit("message_read", result.rows[0]);
        }
      } catch (error) {
        console.error("Read status error:", error);
      }
    });

    socket.on("disconnect", async () => {
      try {
        await pool.query(
          `UPDATE users
           SET is_online = FALSE,
               last_seen = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [userId]
        );

        console.log("DEVHUB user disconnected:", userId);
      } catch (error) {
        console.error("Disconnect error:", error);
      }
    });
  });
}

module.exports = setupSocket;

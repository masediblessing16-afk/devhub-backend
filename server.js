require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

const authRoutes = require("./src/routes/auth");
const userRoutes = require("./src/routes/users");
const conversationRoutes = require("./src/routes/conversations");
const messageRoutes = require("./src/routes/messages");
const setupSocket = require("./src/socket");

const app = express();
const server = http.createServer(app);

const allowedOrigins =
  process.env.CORS_ORIGIN === "*"
    ? "*"
    : (process.env.CORS_ORIGIN || "")
        .split(",")
        .map((origin) => origin.trim());

app.use(helmet());

app.use(
  cors({
    origin: allowedOrigins
  })
);

app.use(express.json({ limit: "1mb" }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api", apiLimiter);

app.get("/", (req, res) => {
  res.json({
    app: "DEVHUB",
    version: "1.0.0",
    status: "online"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "DEVHUB backend",
    timestamp: new Date().toISOString()
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "Route not found"
  });
});

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    error: "Internal server error"
  });
});

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  }
});

setupSocket(io);

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`DEVHUB backend listening on port ${PORT}`);
});

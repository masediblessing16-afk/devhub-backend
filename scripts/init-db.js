require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function initDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    const schemaPath = path.join(
      __dirname,
      "..",
      "database",
      "schema.sql"
    );

    const schema = fs.readFileSync(schemaPath, "utf8");

    await client.query(schema);

    console.log("DEVHUB database initialized successfully.");
  } catch (error) {
    console.error("Database initialization failed:", error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

initDatabase();

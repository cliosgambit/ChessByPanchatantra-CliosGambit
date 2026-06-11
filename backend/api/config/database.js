// backend/api/config/database.js

const { Pool } = require('pg');

// This line loads the DATABASE_URL from your .env file
require('dotenv').config();

// Create a new connection pool. This is the modern way to handle db connections.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // The ssl object is required for connecting to cloud databases like Supabase/Render
  ssl: {
    rejectUnauthorized: false
  }
});

// We export a single, universal query function for the entire application.
module.exports = {
  query: (text, params) => pool.query(text, params),
}; 


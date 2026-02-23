require('dotenv').config();

const config = {
  DATABASE_URL: process.env.DATABASE_URL || 'sqlite:///db.sqlite3',
  PORT: parseInt(process.env.PORT || '3000', 10),
  MAX_RETRIES: 3,
  DEBUG: process.env.NODE_ENV !== 'production',
  API_KEY: process.env.API_KEY || 'default-key',
};

module.exports = config;

const express = require('express');
const { UserService } = require('./services/userService');
const { validateEmail } = require('./utils/validators');
const config = require('./config');

const app = express();
const userService = new UserService(config.DATABASE_URL);

app.get('/users', async (req, res) => {
  const users = await userService.getAll();
  res.json(users);
});

app.post('/users', async (req, res) => {
  const { name, email } = req.body;
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  const user = await userService.create(name, email);
  res.json(user);
});

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
});

module.exports = app;

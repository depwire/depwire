const EMAIL_REGEX = /^[\w.-]+@[\w.-]+\.\w+$/;

function validateEmail(email) {
  return EMAIL_REGEX.test(email);
}

function validateName(name) {
  return typeof name === 'string' && name.trim().length >= 2;
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/[<>]/g, '');
}

module.exports = { validateEmail, validateName, sanitizeInput };

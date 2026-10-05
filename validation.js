const MIN_PASSWORD_LENGTH = 8;

function passwordError(password) {
  if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

module.exports = { MIN_PASSWORD_LENGTH, passwordError };

require('dotenv').config();

const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'PAYSTACK_SECRET_KEY'];
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const app = require('./app');
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`De Fountain Academy API running on port ${port}`));

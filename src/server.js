require('dotenv').config();
const app = require('./app');
const pool = require('./config/db');
const port = Number(process.env.PORT || 3000);

const server = app.listen(port, () => console.log(`Udupi Hotel API listening on port ${port}`));
process.on('SIGTERM', async () => { server.close(); await pool.end(); });

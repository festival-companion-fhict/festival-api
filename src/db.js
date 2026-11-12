const sql = require('mssql');

// Verbinding met de Azure SQL-database.
// festival_api is een "contained user" in festival-db, dus de database
// MOET in de verbinding staan (anders mislukt de login).
function getConfig() {
  return {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    options: {
      encrypt: true, // verplicht voor Azure SQL
      trustServerCertificate: false,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 30000,
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// De database draait op het serverless free offer en kan "gepauzeerd" zijn.
// De eerste verbinding faalt dan terwijl de db opstart; daarom retry met
// oplopende wachttijd (2s, 4s, 6s).
async function connectWithRetry(context, attempts = 4) {
  let lastError;
  for (let poging = 1; poging <= attempts; poging++) {
    try {
      const pool = new sql.ConnectionPool(getConfig());
      await pool.connect();
      return pool;
    } catch (error) {
      lastError = error;
      context?.warn?.(
        `SQL-verbinding poging ${poging}/${attempts} mislukt: ${error.message}`
      );
      if (poging < attempts) {
        await sleep(poging * 2000);
      }
    }
  }
  throw lastError;
}

// We hergebruiken één pool tussen requests (warme Function App).
// Mislukt de verbinding, dan wissen we de cache zodat de volgende request
// het opnieuw probeert (db kan dan inmiddels wakker zijn).
let poolPromise;

function getPool(context) {
  if (!poolPromise) {
    poolPromise = connectWithRetry(context).catch((error) => {
      poolPromise = undefined;
      throw error;
    });
  }
  return poolPromise;
}

module.exports = { getPool, sql };

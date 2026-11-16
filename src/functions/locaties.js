const { app } = require('@azure/functions');
const { getPool } = require('../db');

// GET /api/locaties
// Geeft alle locaties terug. JSON-veldnamen zijn exact de kolomnamen uit
// dbo.locaties (SELECT *), zoals afgesproken.
app.http('locaties', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'locaties',
  handler: async (request, context) => {
    try {
      const pool = await getPool(context);
      const result = await pool.request().query('SELECT * FROM dbo.locaties');
      return { jsonBody: result.recordset };
    } catch (error) {
      context.error('Fout bij ophalen locaties:', error);
      return {
        status: 503,
        jsonBody: {
          error: 'Database tijdelijk niet bereikbaar. Probeer het zo opnieuw.',
        },
      };
    }
  },
});

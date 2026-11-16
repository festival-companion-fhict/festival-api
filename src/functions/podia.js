const { app } = require('@azure/functions');
const { getPool } = require('../db');

// GET /api/podia
// Geeft alle podia terug. JSON-veldnamen zijn exact de kolomnamen uit
// dbo.podia (SELECT *), zoals afgesproken.
app.http('podia', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'podia',
  handler: async (request, context) => {
    try {
      const pool = await getPool(context);
      const result = await pool.request().query('SELECT * FROM dbo.podia');
      return { jsonBody: result.recordset };
    } catch (error) {
      context.error('Fout bij ophalen podia:', error);
      return {
        status: 503,
        jsonBody: {
          error: 'Database tijdelijk niet bereikbaar. Probeer het zo opnieuw.',
        },
      };
    }
  },
});

const { app } = require('@azure/functions');
const { getPool } = require('../db');

// GET /api/artiesten
// Geeft alle artiesten terug. JSON-veldnamen zijn exact de kolomnamen uit
// dbo.artiesten (SELECT *), zoals afgesproken.
app.http('artiesten', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'artiesten',
  handler: async (request, context) => {
    try {
      const pool = await getPool(context);
      const result = await pool.request().query('SELECT * FROM dbo.artiesten');
      return { jsonBody: result.recordset };
    } catch (error) {
      context.error('Fout bij ophalen artiesten:', error);
      return {
        status: 503,
        jsonBody: {
          error: 'Database tijdelijk niet bereikbaar. Probeer het zo opnieuw.',
        },
      };
    }
  },
});

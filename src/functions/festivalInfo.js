const { app } = require('@azure/functions');
const { getPool } = require('../db');

// GET /api/festival_info
// Algemene festivalgegevens (naam, datum, hulplijnnummer) als één object.
// 404 als er nog geen festivalinfo in de database staat.
app.http('festivalInfo', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'festival_info',
  handler: async (request, context) => {
    try {
      const pool = await getPool(context);
      const result = await pool.request().query(
        `SELECT TOP 1 id, naam, datum, hulplijn_nummer
         FROM dbo.festival_info
         ORDER BY id`
      );

      if (result.recordset.length === 0) {
        return {
          status: 404,
          jsonBody: { error: 'Geen festivalinfo gevonden.' },
        };
      }

      return { jsonBody: result.recordset[0] };
    } catch (error) {
      context.error('Fout bij ophalen festivalinfo:', error);
      return {
        status: 503,
        jsonBody: {
          error: 'Database tijdelijk niet bereikbaar. Probeer het zo opnieuw.',
        },
      };
    }
  },
});

const { app } = require('@azure/functions');
const { getPool } = require('../db');

// GET /api/optredens
// Geeft alle optredens terug, met daarbij artiest_naam en podium_naam via een
// JOIN met artiesten en podia (zoals afgesproken). De overige veldnamen zijn
// exact de kolomnamen uit dbo.optredens. Tijden (DATETIME2) staan in
// Nederlandse tijd en gaan ongewijzigd mee, zonder tijdzone-omrekening.
app.http('optredens', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'optredens',
  handler: async (request, context) => {
    try {
      const pool = await getPool(context);
      const result = await pool.request().query(
        `SELECT o.*, a.naam AS artiest_naam, p.naam AS podium_naam
         FROM dbo.optredens o
         LEFT JOIN dbo.artiesten a ON a.id = o.artiest_id
         LEFT JOIN dbo.podia p ON p.id = o.podium_id
         ORDER BY o.starttijd`
      );
      return { jsonBody: result.recordset };
    } catch (error) {
      context.error('Fout bij ophalen optredens:', error);
      return {
        status: 503,
        jsonBody: {
          error: 'Database tijdelijk niet bereikbaar. Probeer het zo opnieuw.',
        },
      };
    }
  },
});

const { app } = require('@azure/functions');
const { getPool } = require('../db');

// GET /api/aankondigingen
// Alle aankondigingen, nieuwste eerst, met naam van de artiest en naam en
// coördinaten van de locatie erbij (NULL als er geen artiest/locatie is).
// Geen filters; de app filtert zelf.
app.http('aankondigingen', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'aankondigingen',
  handler: async (request, context) => {
    try {
      const pool = await getPool(context);
      const result = await pool.request().query(
        `SELECT a.id, a.titel, a.tekst, a.categorie, a.tijd, a.belangrijk,
                a.artiest_id, ar.naam AS artiest_naam,
                a.locatie_id, l.naam AS locatie_naam, l.lat AS locatie_lat, l.lon AS locatie_lon
         FROM dbo.aankondigingen a
         LEFT JOIN dbo.artiesten ar ON ar.id = a.artiest_id
         LEFT JOIN dbo.locaties l ON l.id = a.locatie_id
         ORDER BY a.tijd DESC`
      );
      return { jsonBody: result.recordset };
    } catch (error) {
      context.error('Fout bij ophalen aankondigingen:', error);
      return {
        status: 503,
        jsonBody: {
          error: 'Database tijdelijk niet bereikbaar. Probeer het zo opnieuw.',
        },
      };
    }
  },
});

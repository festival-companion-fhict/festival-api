const { app } = require('@azure/functions');
const { getPool } = require('../db');
const { MELDING_SELECT, foutAntwoord, DB_FOUT } = require('../meldingen');

// GET /api/meldingen (alleen voor het EHBO-dashboard, function key nodig)
// Alle meldingen, nieuwste eerst, met melder en zone erbij.
app.http('meldingenGet', {
  methods: ['GET'],
  authLevel: 'function',
  route: 'meldingen',
  handler: async (request, context) => {
    try {
      const pool = await getPool(context);
      const result = await pool
        .request()
        .query(`${MELDING_SELECT} ORDER BY m.tijd DESC, m.id DESC`);
      return { jsonBody: result.recordset };
    } catch (error) {
      context.error('Fout bij ophalen meldingen:', error);
      return foutAntwoord(503, DB_FOUT);
    }
  },
});

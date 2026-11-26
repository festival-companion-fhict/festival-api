const { app } = require('@azure/functions');
const { getPool, sql } = require('../db');
const { MELDING_SELECT, isPositiefId, foutAntwoord, DB_FOUT } = require('../meldingen');

const STATUSSEN = ['OPEN', 'IN_BEHANDELING', 'AFGEHANDELD'];

// PATCH /api/meldingen/{id} (alleen voor het EHBO-dashboard, function key nodig)
// Zet de status van een melding: { status }. Antwoord: de bijgewerkte melding
// in dezelfde vorm als bij GET /api/meldingen.
app.http('meldingStatus', {
  methods: ['PATCH'],
  authLevel: 'function',
  route: 'meldingen/{id}',
  handler: async (request, context) => {
    const idTekst = request.params.id;
    const id = /^\d+$/.test(idTekst) ? Number(idTekst) : NaN;
    if (!isPositiefId(id)) {
      return foutAntwoord(400, 'id moet een positief geheel getal zijn.');
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return foutAntwoord(400, 'De body is geen geldige JSON.');
    }
    const status = body?.status;
    if (!STATUSSEN.includes(status)) {
      return foutAntwoord(400, `status moet een van deze zijn: ${STATUSSEN.join(', ')}.`);
    }

    try {
      const pool = await getPool(context);
      const update = await pool
        .request()
        .input('id', sql.Int, id)
        .input('status', sql.NVarChar(20), status)
        .query('UPDATE dbo.meldingen SET status = @status WHERE id = @id');

      if (update.rowsAffected[0] === 0) {
        return foutAntwoord(404, 'Melding niet gevonden.');
      }

      const result = await pool
        .request()
        .input('id', sql.Int, id)
        .query(`${MELDING_SELECT} WHERE m.id = @id`);

      return { jsonBody: result.recordset[0] };
    } catch (error) {
      context.error('Fout bij bijwerken status melding:', error);
      return foutAntwoord(503, DB_FOUT);
    }
  },
});

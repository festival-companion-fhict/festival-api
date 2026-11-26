const { app } = require('@azure/functions');
const { getPool, sql } = require('../db');
const { isPositiefId, foutAntwoord, DB_FOUT } = require('../meldingen');

const TYPES = ['AFVAL', 'TOILET', 'KAPOT', 'LEKKAGE', 'VERLOREN', 'OVERIG', 'MEDICAL', 'SECURITY'];const MAX_BESCHRIJVING = 500;

const isLeeg = (waarde) => waarde === undefined || waarde === null;

// POST /api/meldingen (voor de app)
// Slaat een melding op: { type, beschrijving?, lat?, lon?, gebruiker_id? }.
// status en tijd zet de database zelf. Antwoord: { id }.
function controleerMelding(body) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return 'De body moet een object zijn met minstens type.';
  }
  const { type, beschrijving, lat, lon, gebruiker_id } = body;

  if (!TYPES.includes(type)) {
    return `type is verplicht en moet een van deze zijn: ${TYPES.join(', ')}.`;
  }
  if (!isLeeg(beschrijving)) {
    if (typeof beschrijving !== 'string') {
      return 'beschrijving moet tekst zijn.';
    }
    if (beschrijving.length > MAX_BESCHRIJVING) {
      return `beschrijving mag maximaal ${MAX_BESCHRIJVING} tekens zijn.`;
    }
  }
  if (isLeeg(lat) !== isLeeg(lon)) {
    return 'Geef lat en lon allebei mee, of allebei niet.';
  }
  if (!isLeeg(lat)) {
    if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
      return 'lat moet een getal tussen -90 en 90 zijn.';
    }
    if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      return 'lon moet een getal tussen -180 en 180 zijn.';
    }
  }
  if (!isLeeg(gebruiker_id) && !isPositiefId(gebruiker_id)) {
    return 'gebruiker_id moet een positief geheel getal zijn.';
  }
  return null;
}

app.http('meldingenPost', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'meldingen',
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return foutAntwoord(400, 'De body is geen geldige JSON.');
    }

    const fout = controleerMelding(body);
    if (fout) {
      return foutAntwoord(400, fout);
    }

    const beschrijving =
      typeof body.beschrijving === 'string' && body.beschrijving.trim() !== ''
        ? body.beschrijving
        : null;
    // Afronden op 6 decimalen, net als DECIMAL(9,6) in de database.
    const lat = isLeeg(body.lat) ? null : Number(body.lat.toFixed(6));
    const lon = isLeeg(body.lon) ? null : Number(body.lon.toFixed(6));

    try {
      const pool = await getPool(context);
      const result = await pool
        .request()
        .input('gebruiker_id', sql.Int, body.gebruiker_id ?? null)
        .input('type', sql.NVarChar(50), body.type)
        .input('beschrijving', sql.NVarChar(500), beschrijving)
        .input('lat', sql.Decimal(9, 6), lat)
        .input('lon', sql.Decimal(9, 6), lon)
        .query(
          `INSERT INTO dbo.meldingen (gebruiker_id, type, beschrijving, lat, lon)
           OUTPUT INSERTED.id
           VALUES (@gebruiker_id, @type, @beschrijving, @lat, @lon)`
        );

      return { status: 201, jsonBody: { id: result.recordset[0].id } };
    } catch (error) {
      // 547 = foreign key-fout: gebruiker_id bestaat niet in dbo.gebruikers.
      const foutnummer = error.number ?? error.originalError?.info?.number;
      if (foutnummer === 547) {
        return foutAntwoord(400, 'Onbekende gebruiker_id.');
      }
      context.error('Fout bij opslaan melding:', error);
      return foutAntwoord(503, DB_FOUT);
    }
  },
});

// Gedeelde query voor GET /api/meldingen en PATCH /api/meldingen/{id},
// zodat beide endpoints een melding in precies dezelfde vorm teruggeven.
// melder: naam uit dbo.gebruikers, of 'Anoniem' zonder gebruiker_id.
// zone: eerste zone (laagste id) waarvan de rechthoek het punt bevat
// (x = lon, y = lat); zonder locatie of buiten alle zones NULL.
const MELDING_SELECT = `
  SELECT m.id, m.gebruiker_id, m.type, m.beschrijving, m.lat, m.lon, m.tijd, m.status,
         CASE WHEN m.gebruiker_id IS NULL THEN 'Anoniem' ELSE g.naam END AS melder,
         z.naam AS zone
  FROM dbo.meldingen m
  LEFT JOIN dbo.gebruikers g ON g.id = m.gebruiker_id
  OUTER APPLY (
    SELECT TOP 1 zn.naam
    FROM dbo.zones zn
    WHERE m.lon BETWEEN zn.x_min AND zn.x_max
      AND m.lat BETWEEN zn.y_min AND zn.y_max
    ORDER BY zn.id
  ) z`;

const MAX_INT = 2147483647;

function isPositiefId(waarde) {
  return Number.isInteger(waarde) && waarde > 0 && waarde <= MAX_INT;
}

function foutAntwoord(status, melding) {
  return { status, jsonBody: { error: melding } };
}

const DB_FOUT = 'Database tijdelijk niet bereikbaar. Probeer het zo opnieuw.';

module.exports = { MELDING_SELECT, isPositiefId, foutAntwoord, DB_FOUT };

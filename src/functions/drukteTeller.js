const { app } = require('@azure/functions');
const { getPool } = require('../db');

// Timer, elke 5 minuten (xx:00, xx:05, ...).
// Telt per zone de pings van de laatste 5 minuten en schrijft voor elke zone
// een rij in dbo.drukte (ook bij 0). Verwijdert daarna pings ouder dan 24 uur.
app.timer('drukteTeller', {
  schedule: '0 */5 * * * *',
  handler: async (timer, context) => {
    try {
      const pool = await getPool(context);
      const result = await pool.request().query(
        `DECLARE @nu DATETIME2 = SYSUTCDATETIME();
         DECLARE @telling TABLE (zone_id INT, aantal INT);

         INSERT INTO @telling (zone_id, aantal)
         SELECT z.id, COUNT(p.id)
         FROM dbo.zones z
         LEFT JOIN dbo.pings p
           ON p.zone_id = z.id
          AND p.tijd > DATEADD(MINUTE, -5, @nu)
         GROUP BY z.id;

         INSERT INTO dbo.drukte (zone_id, aantal, tijd)
         SELECT zone_id, aantal, @nu FROM @telling;

         DELETE FROM dbo.pings WHERE tijd < DATEADD(HOUR, -24, @nu);
         DECLARE @verwijderd INT = @@ROWCOUNT;

         SELECT z.naam, t.aantal
         FROM @telling t
         JOIN dbo.zones z ON z.id = t.zone_id
         ORDER BY z.id;

         SELECT @verwijderd AS verwijderd;`
      );

      const telling = result.recordsets[0];
      const verwijderd = result.recordsets[1][0].verwijderd;
      const totaal = telling.reduce((som, r) => som + r.aantal, 0);
      const perZone = telling.map((r) => `${r.naam}=${r.aantal}`).join(', ');

      context.log(
        `Drukte geteld voor ${telling.length} zones (totaal ${totaal} pings): ${perZone}. ` +
          `Oude pings verwijderd: ${verwijderd}.`
      );
    } catch (error) {
      context.error('Fout bij tellen drukte:', error);
      throw error;
    }
  },
});

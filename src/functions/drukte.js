const { app } = require('@azure/functions');
const { getPool } = require('../db');

// Verschil in procentpunten (van de capaciteit) waaronder de trend GELIJK is.
const TREND_DREMPEL = 10;

function bepaalNiveau(percentage) {
  if (percentage < 40) return 'RUSTIG';
  if (percentage <= 75) return 'GEMIDDELD';
  return 'DRUK';
}

function bepaalTrend(aantal, vorigAantal, capaciteit) {
  if (vorigAantal === null || vorigAantal === undefined || !capaciteit) {
    return 'GELIJK';
  }
  const verschil = ((aantal - vorigAantal) / capaciteit) * 100;
  if (Math.abs(verschil) < TREND_DREMPEL) return 'GELIJK';
  return verschil > 0 ? 'DRUKKER' : 'RUSTIGER';
}

// GET /api/drukte
// Per zone de laatste telling met percentage, niveau en trend (t.o.v. de
// telling van ongeveer 15 minuten eerder). Niveau en trend worden hier
// berekend, niet opgeslagen. tijd is UTC (zo zet de database hem).
app.http('drukte', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'drukte',
  handler: async (request, context) => {
    try {
      const pool = await getPool(context);
      const result = await pool.request().query(
        `SELECT z.id AS zone_id, z.naam, z.capaciteit,
                z.x_min, z.x_max, z.y_min, z.y_max,
                l.aantal, l.tijd, v.aantal AS vorig_aantal
         FROM dbo.zones z
         OUTER APPLY (
           SELECT TOP 1 d.aantal, d.tijd
           FROM dbo.drukte d
           WHERE d.zone_id = z.id
           ORDER BY d.tijd DESC
         ) l
         OUTER APPLY (
           SELECT TOP 1 d.aantal
           FROM dbo.drukte d
           WHERE d.zone_id = z.id
             AND d.tijd BETWEEN DATEADD(MINUTE, -20, l.tijd) AND DATEADD(MINUTE, -10, l.tijd)
           ORDER BY ABS(DATEDIFF(SECOND, d.tijd, DATEADD(MINUTE, -15, l.tijd)))
         ) v
         ORDER BY z.id`
      );

      const zones = result.recordset.map((r) => {
        const aantal = r.aantal ?? 0;
        const percentage = r.capaciteit > 0 ? (aantal / r.capaciteit) * 100 : 0;
        return {
          zone_id: r.zone_id,
          naam: r.naam,
          capaciteit: r.capaciteit,
          aantal,
          percentage: Math.round(percentage),
          niveau: bepaalNiveau(percentage),
          trend: bepaalTrend(aantal, r.vorig_aantal, r.capaciteit),
          tijd: r.tijd ?? null,
          x_min: r.x_min,
          x_max: r.x_max,
          y_min: r.y_min,
          y_max: r.y_max,
        };
      });

      return { jsonBody: zones };
    } catch (error) {
      context.error('Fout bij ophalen drukte:', error);
      return {
        status: 503,
        jsonBody: {
          error: 'Database tijdelijk niet bereikbaar. Probeer het zo opnieuw.',
        },
      };
    }
  },
});

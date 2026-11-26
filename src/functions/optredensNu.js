const { app } = require('@azure/functions');
const { getPool, sql } = require('../db');

// GET /api/optredens/nu
// Per podium wat er nu speelt en wat er daarna komt (voor het home-scherm).
// De data is van festivalzaterdag 28 juni 2025: de huidige Nederlandse tijd
// wordt naar die dag verplaatst (00:00-06:00 telt als de nacht erna).
// Met ?tijd=2025-06-28T18:42 kan een eigen moment getest worden.

const FESTIVALZATERDAG = '2025-06-28';
const ZATERDAGNACHT = '2025-06-29'; // sets na middernacht horen nog bij zaterdag

const tweeCijfers = (n) => String(n).padStart(2, '0');

// Huidige kloktijd in Nederland, verplaatst naar de festivalzaterdag.
function festivalMoment() {
  const delen = new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const uur = Number(delen.find((d) => d.type === 'hour').value);
  const minuut = Number(delen.find((d) => d.type === 'minute').value);
  const datum = uur < 6 ? ZATERDAGNACHT : FESTIVALZATERDAG;
  return `${datum}T${tweeCijfers(uur)}:${tweeCijfers(minuut)}:00`;
}

// Zet ?tijd= om naar 'YYYY-MM-DDTHH:mm:ss', of null als hij ongeldig is.
function leesTijd(waarde) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(waarde);
  if (!m) return null;
  const [jaar, maand, dag, uur, minuut, seconde = '00'] = m.slice(1);
  const d = new Date(Date.UTC(+jaar, +maand - 1, +dag, +uur, +minuut, +seconde));
  if (
    d.getUTCFullYear() !== +jaar ||
    d.getUTCMonth() !== +maand - 1 ||
    d.getUTCDate() !== +dag ||
    d.getUTCHours() !== +uur ||
    d.getUTCMinutes() !== +minuut ||
    d.getUTCSeconds() !== +seconde
  ) {
    return null;
  }
  return `${jaar}-${maand}-${dag}T${uur}:${minuut}:${seconde}`;
}

function optreden(rij, prefix) {
  if (rij[`${prefix}_optreden_id`] == null) return null;
  return {
    optreden_id: rij[`${prefix}_optreden_id`],
    artiest_id: rij[`${prefix}_artiest_id`],
    artiest_naam: rij[`${prefix}_artiest_naam`],
    starttijd: rij[`${prefix}_starttijd`],
    eindtijd: rij[`${prefix}_eindtijd`],
  };
}

app.http('optredensNu', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'optredens/nu',
  handler: async (request, context) => {
    let tijd = festivalMoment();
    const opgegeven = request.query.get('tijd');
    if (opgegeven !== null) {
      tijd = leesTijd(opgegeven);
      if (!tijd) {
        return {
          status: 400,
          jsonBody: {
            error: 'Ongeldige tijd. Gebruik het formaat YYYY-MM-DDTHH:mm, bijv. 2025-06-28T18:42.',
          },
        };
      }
    }

    try {
      const pool = await getPool(context);
      const result = await pool
        .request()
        .input('tijd', sql.NVarChar(19), tijd)
        .query(
          `DECLARE @t DATETIME2 = CAST(@tijd AS DATETIME2);
           SELECT p.id AS podium_id, p.naam AS podium_naam,
                  nu.id AS nu_optreden_id, nu.artiest_id AS nu_artiest_id,
                  nu.artiest_naam AS nu_artiest_naam,
                  nu.starttijd AS nu_starttijd, nu.eindtijd AS nu_eindtijd,
                  vo.id AS vo_optreden_id, vo.artiest_id AS vo_artiest_id,
                  vo.artiest_naam AS vo_artiest_naam,
                  vo.starttijd AS vo_starttijd, vo.eindtijd AS vo_eindtijd
           FROM dbo.podia p
           OUTER APPLY (
             SELECT TOP 1 o.id, o.artiest_id, a.naam AS artiest_naam, o.starttijd, o.eindtijd
             FROM dbo.optredens o
             LEFT JOIN dbo.artiesten a ON a.id = o.artiest_id
             WHERE o.podium_id = p.id AND o.starttijd <= @t AND o.eindtijd > @t
             ORDER BY o.starttijd
           ) nu
           OUTER APPLY (
             SELECT TOP 1 o.id, o.artiest_id, a.naam AS artiest_naam, o.starttijd, o.eindtijd
             FROM dbo.optredens o
             LEFT JOIN dbo.artiesten a ON a.id = o.artiest_id
             WHERE o.podium_id = p.id AND o.starttijd > @t
             ORDER BY o.starttijd
           ) vo
           ORDER BY p.id`
        );

      return {
        jsonBody: {
          tijd,
          podia: result.recordset.map((rij) => ({
            podium_id: rij.podium_id,
            podium_naam: rij.podium_naam,
            nu: optreden(rij, 'nu'),
            volgende: optreden(rij, 'vo'),
          })),
        },
      };
    } catch (error) {
      context.error('Fout bij ophalen optredens nu:', error);
      return {
        status: 503,
        jsonBody: {
          error: 'Database tijdelijk niet bereikbaar. Probeer het zo opnieuw.',
        },
      };
    }
  },
});

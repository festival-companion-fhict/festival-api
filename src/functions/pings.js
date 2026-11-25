const { app } = require('@azure/functions');
const { getPool, sql } = require('../db');

const MAX_PINGS = 1000;

// POST /api/pings
// Slaat één locatie-ping ({ lat, lon, gebruiker_id? }) of een lijst daarvan op.
// Per ping wordt de zone bepaald; buiten alle zones wordt zone_id NULL.
// De tijd zet de database (SYSUTCDATETIME, dus UTC).

function controleerPing(ping) {
  if (typeof ping !== 'object' || ping === null || Array.isArray(ping)) {
    return 'moet een object zijn met lat en lon';
  }
  const { lat, lon, gebruiker_id } = ping;
  if (typeof lat !== 'number' || !Number.isFinite(lat)) {
    return 'lat ontbreekt of is geen getal';
  }
  if (lat < -90 || lat > 90) {
    return 'lat moet tussen -90 en 90 liggen';
  }
  if (typeof lon !== 'number' || !Number.isFinite(lon)) {
    return 'lon ontbreekt of is geen getal';
  }
  if (lon < -180 || lon > 180) {
    return 'lon moet tussen -180 en 180 liggen';
  }
  if (
    gebruiker_id !== undefined &&
    gebruiker_id !== null &&
    !(Number.isInteger(gebruiker_id) && gebruiker_id > 0)
  ) {
    return 'gebruiker_id moet een positief geheel getal zijn';
  }
  return null;
}

// Eerste zone (laagste id) waarvan de rechthoek het punt bevat.
function vindZone(zones, lat, lon) {
  return (
    zones.find(
      (z) => lon >= z.x_min && lon <= z.x_max && lat >= z.y_min && lat <= z.y_max
    ) || null
  );
}

function foutAntwoord(status, melding) {
  return { status, jsonBody: { error: melding } };
}

app.http('pings', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'pings',
  handler: async (request, context) => {
    let body;
    try {
      body = await request.json();
    } catch {
      return foutAntwoord(400, 'De body is geen geldige JSON.');
    }

    const isLijst = Array.isArray(body);
    const lijst = isLijst ? body : [body];

    if (lijst.length === 0) {
      return foutAntwoord(400, 'De lijst met pings is leeg.');
    }
    if (lijst.length > MAX_PINGS) {
      return foutAntwoord(400, `Maximaal ${MAX_PINGS} pings per keer.`);
    }
    for (let i = 0; i < lijst.length; i++) {
      const fout = controleerPing(lijst[i]);
      if (fout) {
        return foutAntwoord(400, isLijst ? `ping ${i + 1}: ${fout}` : `ping: ${fout}`);
      }
    }

    try {
      const pool = await getPool(context);
      const zones = (
        await pool
          .request()
          .query('SELECT id, naam, x_min, x_max, y_min, y_max FROM dbo.zones ORDER BY id')
      ).recordset;

      // Afronden op 6 decimalen, net als DECIMAL(9,6) in de database.
      const rijen = lijst.map((p) => {
        const lat = Number(p.lat.toFixed(6));
        const lon = Number(p.lon.toFixed(6));
        const zone = vindZone(zones, lat, lon);
        return {
          gebruiker_id: p.gebruiker_id ?? null,
          zone_id: zone ? zone.id : null,
          lat: lat.toFixed(6),
          lon: lon.toFixed(6),
          zone_naam: zone ? zone.naam : null,
        };
      });

      // Alles in één INSERT via OPENJSON.
      await pool
        .request()
        .input('pings', sql.NVarChar(sql.MAX), JSON.stringify(rijen))
        .query(
          `INSERT INTO dbo.pings (gebruiker_id, zone_id, lat, lon, tijd)
           SELECT gebruiker_id, zone_id, lat, lon, SYSUTCDATETIME()
           FROM OPENJSON(@pings) WITH (
             gebruiker_id INT,
             zone_id INT,
             lat DECIMAL(9, 6),
             lon DECIMAL(9, 6)
           )`
        );

      if (isLijst) {
        return { status: 201, jsonBody: { opgeslagen: rijen.length } };
      }
      return { status: 201, jsonBody: { zone: rijen[0].zone_naam } };
    } catch (error) {
      // 547 = foreign key-fout: gebruiker_id bestaat niet in dbo.gebruikers.
      const foutnummer = error.number ?? error.originalError?.info?.number;
      if (foutnummer === 547) {
        return foutAntwoord(400, 'Onbekende gebruiker_id.');
      }
      context.error('Fout bij opslaan pings:', error);
      return foutAntwoord(503, 'Database tijdelijk niet bereikbaar. Probeer het zo opnieuw.');
    }
  },
});

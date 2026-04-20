#!/bin/sh
set -e

DB_URL="${WW_DATABASE_URL:?WW_DATABASE_URL must be set}"
: "${WW_STATION_LATITUDE:?WW_STATION_LATITUDE must be set}"
: "${WW_STATION_LONGITUDE:?WW_STATION_LONGITUDE must be set}"

# Convert async URL to sync for psql/psycopg2
SYNC_URL=$(echo "$DB_URL" | sed 's|postgresql+asyncpg://|postgresql://|')

echo "Checking if database is already seeded..."
ROW_COUNT=$(SYNC_URL="$SYNC_URL" uv run python -c "
import os, time, psycopg2
for attempt in range(10):
    try:
        conn = psycopg2.connect(os.environ['SYNC_URL'])
        break
    except psycopg2.OperationalError:
        if attempt == 9:
            raise
        time.sleep(2)
try:
    cur = conn.cursor()
    cur.execute('SELECT COUNT(*) FROM weather_observations')
    print(cur.fetchone()[0])
finally:
    conn.close()
")

if ! [ "$ROW_COUNT" -eq "$ROW_COUNT" ] 2>/dev/null; then
    echo "ERROR: Failed to query database (got: $ROW_COUNT)" >&2
    exit 1
fi

if [ "$ROW_COUNT" -gt 0 ]; then
    echo "Database already contains $ROW_COUNT observations, skipping seed."
    exit 0
fi

STATION_ID="${WW_STATION_NAME:-simulator}"

echo "Database is empty, starting backfill..."
uv run simulator backfill \
    --db-url "$DB_URL" \
    --lat "${WW_STATION_LATITUDE}" \
    --lon "${WW_STATION_LONGITUDE}" \
    --start 2021-01-01 \
    --end 2023-12-31 \
    --station-id "$STATION_ID"

echo "Registering station record..."
SYNC_URL="$SYNC_URL" STATION_ID="$STATION_ID" uv run python -c "
import os, psycopg2
conn = psycopg2.connect(os.environ['SYNC_URL'])
try:
    cur = conn.cursor()
    cur.execute(
        '''INSERT INTO stations (id, name, latitude, longitude, altitude)
           VALUES (%s, %s, %s, %s, %s)
           ON CONFLICT (id) DO NOTHING''',
        (os.environ['STATION_ID'], os.environ['STATION_ID'],
         float(os.environ.get('WW_STATION_LATITUDE', 0)),
         float(os.environ.get('WW_STATION_LONGITUDE', 0)),
         float(os.environ.get('WW_STATION_ALTITUDE', 0)))
    )
    conn.commit()
finally:
    conn.close()
"
echo "Seed complete."

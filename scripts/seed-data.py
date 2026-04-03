#!/usr/bin/env python3
"""Seed the database with 30 days of realistic fake weather data.

Usage:
    python scripts/seed-data.py [--database-url postgresql+asyncpg://...]
"""

import argparse
import asyncio
import math
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Import here so the script can run standalone
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.models.base import Base
from app.models.observation import WeatherObservation
from app.models.station import Station

DEFAULT_DB_URL = "postgresql+asyncpg://waffleweather:devpassword@localhost:5432/waffleweather"
STATION_ID = "seed-station-001"
INTERVAL_MINUTES = 5
DAYS = 30


def generate_observation(ts: datetime, day_frac: float, day_of_year: int) -> dict:
    """Generate a realistic observation for a given timestamp."""
    # Seasonal base temp: warmer in summer (southern hemisphere April = autumn)
    seasonal = 5 * math.cos(2 * math.pi * (day_of_year - 15) / 365)
    # Diurnal cycle: warmest at ~14:00, coolest at ~05:00
    diurnal = 7 * math.sin(2 * math.pi * (day_frac - 0.25))
    temp = 18 + seasonal + diurnal + random.gauss(0, 1.5)

    humidity = max(20, min(100, 65 - diurnal * 3 + random.gauss(0, 5)))
    dewpoint = temp - ((100 - humidity) / 5)

    # Pressure with slow drift
    pressure_rel = 1013.25 + 5 * math.sin(2 * math.pi * day_of_year / 7) + random.gauss(0, 1)
    pressure_abs = pressure_rel - 2.5

    wind_speed = max(0, 8 + 5 * math.sin(2 * math.pi * day_frac) + random.gauss(0, 3))
    wind_gust = wind_speed + random.uniform(2, 8)
    wind_dir = (180 + 60 * math.sin(2 * math.pi * day_of_year / 3) + random.gauss(0, 20)) % 360

    # Rain: occasional events
    is_rainy = random.random() < 0.08
    rain_rate = max(0, random.gauss(5, 3)) if is_rainy else 0.0
    rain_daily = rain_rate * random.uniform(0.5, 3) if is_rainy else random.uniform(0, 0.5)

    # Solar: daytime only (roughly 6am to 6pm)
    solar = max(0, 800 * math.sin(math.pi * max(0, min(1, (day_frac - 0.25) / 0.5))))
    solar *= random.uniform(0.3, 1.0)  # cloud cover variation
    uv = max(0, solar / 100 * random.uniform(0.8, 1.2))

    feels_like = temp - (wind_speed * 0.2) if temp < 10 else temp + (humidity - 50) * 0.05

    return {
        "timestamp": ts,
        "station_id": STATION_ID,
        "temp_outdoor": round(temp, 1),
        "temp_indoor": round(22 + random.gauss(0, 0.5), 1),
        "dewpoint": round(dewpoint, 1),
        "feels_like": round(feels_like, 1),
        "humidity_outdoor": round(humidity, 1),
        "humidity_indoor": round(45 + random.gauss(0, 3), 1),
        "pressure_abs": round(pressure_abs, 2),
        "pressure_rel": round(pressure_rel, 2),
        "wind_speed": round(wind_speed, 1),
        "wind_gust": round(wind_gust, 1),
        "wind_dir": round(wind_dir, 1),
        "rain_rate": round(rain_rate, 2),
        "rain_daily": round(rain_daily, 2),
        "solar_radiation": round(solar, 1),
        "uv_index": round(uv, 1),
    }


async def seed(database_url: str):
    engine = create_async_engine(database_url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=DAYS)

    async with session_factory() as session:
        async with session.begin():
            # Create station
            from sqlalchemy.dialects.postgresql import insert as pg_insert

            stmt = (
                pg_insert(Station)
                .values(id=STATION_ID, name="Seed Station", last_seen=now)
                .on_conflict_do_update(
                    index_elements=["id"],
                    set_={"last_seen": now, "name": "Seed Station"},
                )
            )
            await session.execute(stmt)

    # Generate observations in batches
    total_points = DAYS * 24 * 60 // INTERVAL_MINUTES
    batch_size = 500
    batch = []
    count = 0

    for i in range(total_points):
        ts = start + timedelta(minutes=i * INTERVAL_MINUTES)
        day_frac = (ts.hour * 60 + ts.minute) / 1440
        day_of_year = ts.timetuple().tm_yday

        obs_data = generate_observation(ts, day_frac, day_of_year)
        batch.append(obs_data)

        if len(batch) >= batch_size:
            async with session_factory() as session:
                async with session.begin():
                    session.add_all([WeatherObservation(**d) for d in batch])
            count += len(batch)
            print(f"  Inserted {count}/{total_points} observations...", flush=True)
            batch = []

    if batch:
        async with session_factory() as session:
            async with session.begin():
                session.add_all([WeatherObservation(**d) for d in batch])
        count += len(batch)

    await engine.dispose()
    print(f"Done! Seeded {count} observations over {DAYS} days for station {STATION_ID}")


def main():
    parser = argparse.ArgumentParser(description="Seed WaffleWeather database with fake data")
    parser.add_argument("--database-url", default=DEFAULT_DB_URL, help="Database URL")
    args = parser.parse_args()

    print(f"Seeding {DAYS} days of data ({DAYS * 24 * 60 // INTERVAL_MINUTES} observations)...")
    asyncio.run(seed(args.database_url))


if __name__ == "__main__":
    main()

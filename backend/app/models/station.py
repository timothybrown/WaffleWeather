from sqlalchemy import Column, DateTime, Float, String

from app.models.base import Base


class Station(Base):
    __tablename__ = "stations"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=True)
    model = Column(String, nullable=True)
    firmware_version = Column(String, nullable=True)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    altitude = Column(Float, nullable=True)  # meters above sea level

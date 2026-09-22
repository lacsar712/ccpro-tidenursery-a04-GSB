from datetime import date, datetime
from typing import Optional

from sqlalchemy import Integer, ForeignKey, Date, DateTime, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class LarvaInventory(Base):
    __tablename__ = "larva_inventories"
    __table_args__ = (
        UniqueConstraint("pond_id", "count_date", name="uq_pond_count_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    pond_id: Mapped[int] = mapped_column(ForeignKey("ponds.id"), nullable=False, index=True)
    count_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    count_a: Mapped[int] = mapped_column(Integer, nullable=False)
    count_b: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sealed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    pond: Mapped["Pond"] = relationship("Pond", back_populates="larva_inventories")

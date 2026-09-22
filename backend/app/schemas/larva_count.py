from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class LarvaCountCreate(BaseModel):
    pond_id: int = Field(..., alias="pondId")
    count_date: date = Field(..., alias="countDate")
    count_a: int = Field(..., ge=0, alias="countA")
    count_b: int = Field(..., ge=0, alias="countB")
    notes: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class LarvaCountUpdate(BaseModel):
    count_a: Optional[int] = Field(None, ge=0, alias="countA")
    count_b: Optional[int] = Field(None, ge=0, alias="countB")
    notes: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class LarvaCountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    pond_id: int = Field(serialization_alias="pondId")
    count_date: date = Field(serialization_alias="countDate")
    count_a: int = Field(serialization_alias="countA")
    count_b: int = Field(serialization_alias="countB")
    notes: Optional[str] = None
    sealed_at: Optional[datetime] = Field(None, serialization_alias="sealedAt")


class ReconcileRow(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    hatchery_id: int = Field(serialization_alias="hatcheryId")
    hatchery_name: str = Field(serialization_alias="hatcheryName")
    sealed_count: int = Field(serialization_alias="sealedCount")
    unsealed_count: int = Field(serialization_alias="unsealedCount")
    difference: int
    balanced: bool

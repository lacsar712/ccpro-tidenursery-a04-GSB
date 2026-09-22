from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class LarvaInventoryCreate(BaseModel):
    pond_id: int = Field(..., alias="pondId")
    # 盘点日按东八区日历日切分；缺省时由服务端取东八区当天
    count_date: Optional[date] = Field(None, alias="countDate")
    count_a: int = Field(..., ge=0, alias="countA")
    count_b: int = Field(..., ge=0, alias="countB")
    notes: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(populate_by_name=True)


class LarvaInventoryUpdate(BaseModel):
    count_a: Optional[int] = Field(None, ge=0, alias="countA")
    count_b: Optional[int] = Field(None, ge=0, alias="countB")
    notes: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(populate_by_name=True)


class LarvaInventoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    pond_id: int = Field(serialization_alias="pondId")
    count_date: date = Field(serialization_alias="countDate")
    count_a: int = Field(serialization_alias="countA")
    count_b: int = Field(serialization_alias="countB")
    notes: Optional[str] = None
    sealed_at: Optional[datetime] = Field(None, serialization_alias="sealedAt")


class ReconcileOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    hatchery_id: int = Field(serialization_alias="hatcheryId")
    sealed_count: int = Field(serialization_alias="sealedCount")
    unsealed_count: int = Field(serialization_alias="unsealedCount")
    difference: int

from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.hatchery import Hatchery
from app.models.larva_inventory import LarvaInventory
from app.models.pond import Pond
from app.models.user import User
from app.schemas.larva_inventory import (
    LarvaInventoryCreate,
    LarvaInventoryOut,
    LarvaInventoryUpdate,
    ReconcileOut,
)

router = APIRouter(prefix="/api/larva-inventories", tags=["larva-inventories"])

# 盘点日按东八区日历日切分
CN_TZ = timezone(timedelta(hours=8))


def today_cn() -> date:
    return datetime.now(CN_TZ).date()


def get_inventory_or_404(db: Session, inventory_id: int) -> LarvaInventory:
    item = db.query(LarvaInventory).filter(LarvaInventory.id == inventory_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="盘点记录不存在")
    return item


@router.get("", response_model=List[LarvaInventoryOut])
def list_inventories(
    pond_id: Optional[int] = Query(None, alias="pondId"),
    hatchery_id: Optional[int] = Query(None, alias="hatcheryId"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(LarvaInventory)
    if pond_id is not None:
        q = q.filter(LarvaInventory.pond_id == pond_id)
    if hatchery_id is not None:
        q = q.join(Pond, LarvaInventory.pond_id == Pond.id).filter(
            Pond.hatchery_id == hatchery_id
        )
    return q.order_by(LarvaInventory.count_date.desc(), LarvaInventory.id.desc()).all()


@router.post("", response_model=LarvaInventoryOut, status_code=status.HTTP_201_CREATED)
def create_inventory(
    payload: LarvaInventoryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    pond = db.query(Pond).filter(Pond.id == payload.pond_id).first()
    if not pond:
        raise HTTPException(status_code=400, detail="塘口不存在")
    item = LarvaInventory(
        pond_id=payload.pond_id,
        count_date=payload.count_date or today_cn(),
        count_a=payload.count_a,
        count_b=payload.count_b,
        notes=payload.notes,
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="该塘口当日已存在盘点记录")
    db.refresh(item)
    return item


@router.get("/reconcile", response_model=ReconcileOut)
def reconcile_hatchery(
    hatchery_id: int = Query(..., alias="hatcheryId"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    hatchery = db.query(Hatchery).filter(Hatchery.id == hatchery_id).first()
    if not hatchery:
        raise HTTPException(status_code=404, detail="育苗场不存在")
    q = db.query(LarvaInventory).join(Pond, LarvaInventory.pond_id == Pond.id).filter(
        Pond.hatchery_id == hatchery_id
    )
    sealed_count = q.filter(LarvaInventory.sealed_at.isnot(None)).count()
    unsealed_count = q.filter(LarvaInventory.sealed_at.is_(None)).count()
    difference = unsealed_count
    if difference != 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"对账不平衡：{hatchery.name} 已封盘 {sealed_count} 份，未封盘 {unsealed_count} 份，差额须为零",
        )
    return ReconcileOut(
        hatchery_id=hatchery_id,
        sealed_count=sealed_count,
        unsealed_count=unsealed_count,
        difference=difference,
    )


@router.put("/{inventory_id}", response_model=LarvaInventoryOut)
def update_inventory(
    inventory_id: int,
    payload: LarvaInventoryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = get_inventory_or_404(db, inventory_id)
    if item.sealed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="已封盘，不可再修改计数"
        )
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{inventory_id}/seal", response_model=LarvaInventoryOut)
def seal_inventory(
    inventory_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = get_inventory_or_404(db, inventory_id)
    if item.sealed_at is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="该盘点已封盘")
    a, b = item.count_a, item.count_b
    larger = max(a, b)
    # 甲乙差的绝对值不得超过较大值的 10%，且较大值至少为 1（整数比较避免浮点误差）
    if larger < 1 or 10 * abs(a - b) > larger:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="甲乙计数差额超过两者较大值的 10%（或较大值小于 1），不允许封盘",
        )
    item.sealed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{inventory_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inventory(
    inventory_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = get_inventory_or_404(db, inventory_id)
    if item.sealed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="已封盘，不可删除"
        )
    db.delete(item)
    db.commit()

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.hatchery import Hatchery
from app.models.larva_count import LarvaCount
from app.models.pond import Pond
from app.models.user import User
from app.schemas.larva_count import (
    LarvaCountCreate,
    LarvaCountOut,
    LarvaCountUpdate,
    ReconcileRow,
)

router = APIRouter(prefix="/api/larva-counts", tags=["larva-counts"])


@router.get("", response_model=List[LarvaCountOut])
def list_counts(
    pond_id: Optional[int] = Query(None, alias="pondId"),
    hatchery_id: Optional[int] = Query(None, alias="hatcheryId"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(LarvaCount)
    if pond_id is not None:
        q = q.filter(LarvaCount.pond_id == pond_id)
    if hatchery_id is not None:
        q = q.join(Pond, Pond.id == LarvaCount.pond_id).filter(
            Pond.hatchery_id == hatchery_id
        )
    return q.order_by(LarvaCount.count_date.desc(), LarvaCount.id.desc()).all()


@router.post("", response_model=LarvaCountOut, status_code=status.HTTP_201_CREATED)
def create_count(
    payload: LarvaCountCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    pond = db.query(Pond).filter(Pond.id == payload.pond_id).first()
    if not pond:
        raise HTTPException(status_code=400, detail="塘口不存在")
    item = LarvaCount(
        pond_id=payload.pond_id,
        count_date=payload.count_date,
        count_a=payload.count_a,
        count_b=payload.count_b,
        notes=payload.notes,
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="同塘同日盘点已存在")
    db.refresh(item)
    return item


@router.get("/reconcile", response_model=List[ReconcileRow])
def reconcile(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    sealed = func.coalesce(
        func.sum(case((LarvaCount.sealed_at.isnot(None), 1), else_=0)), 0
    )
    unsealed = func.coalesce(
        func.sum(
            case(
                (and_(LarvaCount.id.isnot(None), LarvaCount.sealed_at.is_(None)), 1),
                else_=0,
            )
        ),
        0,
    )
    rows = (
        db.query(Hatchery.id, Hatchery.name, sealed, unsealed)
        .outerjoin(Pond, Pond.hatchery_id == Hatchery.id)
        .outerjoin(LarvaCount, LarvaCount.pond_id == Pond.id)
        .group_by(Hatchery.id, Hatchery.name)
        .order_by(Hatchery.id)
        .all()
    )
    result = []
    for hatchery_id, hatchery_name, sealed_count, unsealed_count in rows:
        sealed_count = int(sealed_count)
        unsealed_count = int(unsealed_count)
        result.append(
            ReconcileRow(
                hatchery_id=hatchery_id,
                hatchery_name=hatchery_name,
                sealed_count=sealed_count,
                unsealed_count=unsealed_count,
                difference=unsealed_count,
                balanced=unsealed_count == 0,
            )
        )
    return result


@router.put("/{count_id}", response_model=LarvaCountOut)
def update_count(
    count_id: int,
    payload: LarvaCountUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(LarvaCount).filter(LarvaCount.id == count_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="盘点记录不存在")
    if item.sealed_at is not None:
        raise HTTPException(status_code=409, detail="已封盘，不可再改计数")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{count_id}/seal", response_model=LarvaCountOut)
def seal_count(
    count_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(LarvaCount).filter(LarvaCount.id == count_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="盘点记录不存在")
    if item.sealed_at is not None:
        raise HTTPException(status_code=409, detail="该盘点已封盘")
    larger = max(item.count_a, item.count_b)
    diff = abs(item.count_a - item.count_b)
    if larger < 1 or diff * 10 > larger:
        raise HTTPException(
            status_code=409,
            detail="甲乙计数差额超过两者较大值的10%（或较大值不足1），无法封盘",
        )
    item.sealed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{count_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_count(
    count_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    item = db.query(LarvaCount).filter(LarvaCount.id == count_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="盘点记录不存在")
    if item.sealed_at is not None:
        raise HTTPException(status_code=409, detail="已封盘，不可删除")
    db.delete(item)
    db.commit()

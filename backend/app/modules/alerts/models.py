import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, Timestamps


class Alerta(Timestamps, Base):
    __tablename__ = "alerta"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    usuario_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("usuario.id", ondelete="CASCADE"), index=True)
    tipo: Mapped[str] = mapped_column(String(32))
    params: Mapped[dict] = mapped_column(JSONB, default=dict)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    disparado_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

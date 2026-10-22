"""Accounts: users, preferences, dashboards, shares, favorites, authentication and routes."""

from app.modules.accounts.deps import AdminDep, UsuarioDep
from app.modules.accounts.models import Compartilhamento, Favorito, Painel, Preferencia, Usuario
from app.modules.accounts.routes import router

__all__ = [
    "AdminDep",
    "Compartilhamento",
    "Favorito",
    "Painel",
    "Preferencia",
    "Usuario",
    "UsuarioDep",
    "router",
]

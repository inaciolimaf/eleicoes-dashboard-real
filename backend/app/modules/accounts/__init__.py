"""Accounts: users, preferences, dashboards, shares, favorites, authentication and routes."""

from app.modules.accounts.deps import AdminDep, UsuarioDep
from app.modules.accounts.models import Dashboard, Favorite, Preference, Share, User
from app.modules.accounts.routes import router

__all__ = [
    "AdminDep",
    "Dashboard",
    "Favorite",
    "Preference",
    "Share",
    "User",
    "UsuarioDep",
    "router",
]

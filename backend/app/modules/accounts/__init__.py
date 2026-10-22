"""Accounts: users, preferences, dashboards, shares, favorites, authentication and routes."""

from app.modules.accounts.deps import Admin, CurrentUser
from app.modules.accounts.models import Dashboard, Favorite, Preference, Share, User
from app.modules.accounts.routes import router

__all__ = [
    "Admin",
    "CurrentUser",
    "Dashboard",
    "Favorite",
    "Preference",
    "Share",
    "User",
    "router",
]

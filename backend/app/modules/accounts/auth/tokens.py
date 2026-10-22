"""What a sign-in returns: the user and the access token (JWT)."""

from app.core.security import create_token
from app.modules.accounts.models import User
from app.modules.accounts.schemas import TokenDto, UserDto


def user_dto(user: User) -> UserDto:
    return UserDto(id=str(user.id), email=user.email, name=user.name, is_admin=user.is_admin)


def token_dto(user: User) -> TokenDto:
    return TokenDto(
        access_token=create_token(str(user.id)),
        token_type="bearer",  # noqa: S106 - OAuth2 token type, not a password
        user=user_dto(user),
    )

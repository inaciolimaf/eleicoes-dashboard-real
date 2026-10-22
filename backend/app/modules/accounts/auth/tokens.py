"""O que o login devolve: o usuário e o token de acesso (JWT)."""

from app.core.security import criar_token
from app.modules.accounts.models import User
from app.modules.accounts.schemas import TokenDto, UserDto


def user_dto(u: User) -> UserDto:
    return UserDto(id=str(u.id), email=u.email, name=u.name, is_admin=u.is_admin)


def token_dto(u: User) -> TokenDto:
    return TokenDto(
        access_token=criar_token(str(u.id)),
        token_type="bearer",  # noqa: S106 - tipo do token OAuth2, não é senha
        user=user_dto(u),
    )

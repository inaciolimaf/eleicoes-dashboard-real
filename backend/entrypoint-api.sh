#!/bin/sh
# Migra antes de servir, quando pedido: num PaaS com deploy automático ninguém roda `alembic` à mão.
set -e
if [ "${MIGRAR_AO_SUBIR:-false}" = "true" ]; then
	alembic upgrade head
fi
exec "$@"

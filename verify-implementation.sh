#!/bin/bash
# ============================================================
# verify-implementation.sh
# Script para verificar que todos los archivos fueron creados
# ============================================================

echo "🔍 VERIFICANDO IMPLEMENTACIÓN DE SEGURIDAD..."
echo ""

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Contador
FILES_FOUND=0
FILES_EXPECTED=7

# ============================================================
# DOCUMENTACIÓN
# ============================================================

echo "📋 DOCUMENTACIÓN:"

if [ -f "ARQUITECTURA-SEGURIDAD-PRODUCCION.md" ]; then
  echo -e "${GREEN}✓${NC} ARQUITECTURA-SEGURIDAD-PRODUCCION.md"
  ((FILES_FOUND++))
else
  echo -e "${RED}✗${NC} ARQUITECTURA-SEGURIDAD-PRODUCCION.md (FALTA)"
fi

if [ -f "README-SEGURIDAD-PRODUCCION.md" ]; then
  echo -e "${GREEN}✓${NC} README-SEGURIDAD-PRODUCCION.md"
  ((FILES_FOUND++))
else
  echo -e "${RED}✗${NC} README-SEGURIDAD-PRODUCCION.md (FALTA)"
fi

if [ -f "GUIA-IMPLEMENTACION.html" ]; then
  echo -e "${GREEN}✓${NC} GUIA-IMPLEMENTACION.html"
  ((FILES_FOUND++))
else
  echo -e "${RED}✗${NC} GUIA-IMPLEMENTACION.html (FALTA)"
fi

echo ""
echo "🗄️  SQL (PARA SUPABASE DASHBOARD):"

if [ -f "supabase-rls-production.sql" ]; then
  echo -e "${GREEN}✓${NC} supabase-rls-production.sql"
  ((FILES_FOUND++))
else
  echo -e "${RED}✗${NC} supabase-rls-production.sql (FALTA)"
fi

if [ -f "supabase-orders-functions.sql" ]; then
  echo -e "${GREEN}✓${NC} supabase-orders-functions.sql"
  ((FILES_FOUND++))
else
  echo -e "${RED}✗${NC} supabase-orders-functions.sql (FALTA)"
fi

echo ""
echo "💻 JAVASCRIPT (COPIAR A index.html):"

if [ -f "js/image-optimizer.js" ]; then
  SIZE=$(wc -c < "js/image-optimizer.js")
  echo -e "${GREEN}✓${NC} js/image-optimizer.js ($(($SIZE / 1024)) KB)"
  ((FILES_FOUND++))
else
  echo -e "${RED}✗${NC} js/image-optimizer.js (FALTA)"
fi

if [ -f "js/security-validator.js" ]; then
  SIZE=$(wc -c < "js/security-validator.js")
  echo -e "${GREEN}✓${NC} js/security-validator.js ($(($SIZE / 1024)) KB)"
  ((FILES_FOUND++))
else
  echo -e "${RED}✗${NC} js/security-validator.js (FALTA)"
fi

if [ -f "js/order-handler-secure.js" ]; then
  SIZE=$(wc -c < "js/order-handler-secure.js")
  echo -e "${GREEN}✓${NC} js/order-handler-secure.js ($(($SIZE / 1024)) KB)"
  ((FILES_FOUND++))
else
  echo -e "${RED}✗${NC} js/order-handler-secure.js (FALTA)"
fi

echo ""
echo "============================================================"
echo "RESULTADO: $FILES_FOUND de $FILES_EXPECTED archivos encontrados"
echo "============================================================"

if [ $FILES_FOUND -eq $FILES_EXPECTED ]; then
  echo -e "${GREEN}✅ TODOS LOS ARCHIVOS CREADOS EXITOSAMENTE${NC}"
  echo ""
  echo "📌 PRÓXIMOS PASOS:"
  echo "1. Abre: ARQUITECTURA-SEGURIDAD-PRODUCCION.md"
  echo "2. Sigue: GUIA-IMPLEMENTACION.html"
  echo "3. Ejecuta: supabase-*.sql en Supabase Dashboard"
  echo "4. Integra: js/*.js en tu index.html"
  exit 0
else
  echo -e "${YELLOW}⚠️  FALTAN ALGUNOS ARCHIVOS${NC}"
  echo "Se esperaban $FILES_EXPECTED archivos pero solo se encontraron $FILES_FOUND"
  exit 1
fi

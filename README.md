ClickSaaS - Auditoría y despliegue

Resumen rápido:
- Archivo `js/config.js` ahora lee variables desde `window.__env` o `window.SUPABASE_*`.
- Añade `js/env.js` plantilla para inyección de variables en tiempo de despliegue.
- Recomendado: no dejar keys en el repositorio; configura variables de entorno en Vercel.

Variables necesarias (Vercel env):
- SUPABASE_URL — URL de tu instancia Supabase
- SUPABASE_KEY — anon public key (NO usar service_role en cliente)
- SUPER_ADMIN_EMAIL — email de super admin (opcional)
- DEV_MODE — `false` en producción

Instrucciones de despliegue (Vercel):
1. En la UI de Vercel -> Project -> Settings -> Environment Variables, añade las variables mencionadas.
2. En build step o en settings, genera un archivo `js/env.js` con el contenido:

```js
window.__env = {
  SUPABASE_URL: 'https://xyz.supabase.co',
  SUPABASE_KEY: 'anon-xxx',
  SUPER_ADMIN_EMAIL: 'admin@ejemplo.com',
  DEV_MODE: false
};
```

(Alternativa: usar un script de build que escriba `js/env.js` desde variables de entorno.)

RLS y seguridad (recomendado):
- Ejecuta `supabase-policies.sql` en SQL Editor de Supabase para habilitar Row Level Security y aplicar políticas sugeridas.
- Verifica buckets de storage: decide si las imágenes son públicas o requieren validación; para uploads controlados, crea una función serverless que use `service_role` y valide `owner_id`.

Rotación de claves si fueron expuestas:
- Si alguna key fue comprometida, regenera keys desde Supabase dashboard y actualiza `SUPABASE_KEY` en Vercel.

Pruebas manuales recomendadas:
- Registrar nuevo usuario -> crear tienda -> agregar producto -> abrir tienda pública -> agregar al carrito -> enviar pedido (Whatsapp se abre con mensaje formateado).

Pruebas automáticas (Playwright):

1. Instalar dependencias:

```bash
npm install
npx playwright install
```

2. Generar `js/env.js` desde variables de entorno (opcional):

```bash
SUPABASE_URL=... SUPABASE_KEY=... SUPER_ADMIN_EMAIL=... node scripts/generate-env.js
```

3. Levantar servidor local (por ejemplo usando `serve`):

```bash
npx serve . -l 3000
```

4. Ejecutar tests E2E:

```bash
npm run test:e2e
```

Los tests incluidos son pruebas UI cliente-only para validar modales, render de storefront y operaciones de carrito sin depender de Supabase.

Tests E2E con Supabase (opcional, requieren credenciales):

Para ejecutar las pruebas que interactúan con Supabase necesitas definir las siguientes variables de entorno en tu máquina o CI:

- `SUPABASE_URL` — URL de tu proyecto Supabase
- `SUPABASE_SERVICE_ROLE` — service_role key (para crear/limpiar datos de prueba)
- `SUPABASE_ANON` — anon public key (para el cliente en el navegador durante la prueba)

Ejecuta:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... SUPABASE_ANON=... npm run test:e2e
```

La suite ejecutará `tests/e2e.supabase.spec.js` que:
- crea un usuario de prueba, tienda y producto (con la service role key)
- escribe temporalmente `js/env.js` con el anon key para que la app cliente pueda insertar el pedido
- arranca un servidor estático local, navega al storefront, agrega al carrito y envía un pedido
- valida que la orden fue insertada en la tabla `orders` y limpia los datos creados

ADVERTENCIA: estas pruebas modifican datos reales en tu proyecto Supabase; usa un proyecto de prueba o ten cuidado con datos de producción.

Notas de auditoría:
- Evitar hardcodear emails para roles; usar claims o tabla de roles.
- Mover operaciones sensibles a funciones serverless para aislar la `service_role`.

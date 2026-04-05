# 🚀 GUÍA DEPLOYMENT - CLICKSTORE EN VERCEL

## 1. REQUISITOS PREVIOS

- [ ] Cuenta en [Vercel](https://vercel.com) (gratis)
- [ ] Dominio `storesclick.site` registrado (GoDaddy, Namecheap, etc.)
- [ ] Proyecto en GitHub/GitLab (recomendado para deploy automático)
- [ ] Variables de entorno Supabase listos

---

## 2. PASO 1: CREAR PROYECTO EN VERCEL

### 2.1 Conectar Repositorio Git

1. Ve a [vercel.com](https://vercel.com) y haz login
2. Click en **"Add New..."** → **"Project"**
3. Selecciona tu repositorio (GitHub/GitLab)
4. Click **"Import"**

### 2.2 Configurar Builder Settings

En la pantalla de configuración:

```
Framework Preset:     [Other]
Build Command:        [vacío o "npm run build" si existe]
Output Directory:     [vacío o "./dist"]
Install Command:      npm install (default)
```

### 2.3 Variables de Entorno

Agrega estas variables **ANTES de hacer deploy**:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxxx...
VITE_APP_URL=https://storesclick.site
VITE_API_BASE=https://api.storesclick.site (opcional)
```

**Dónde obtenerlas:**

```
1. Ve a Supabase Dashboard
2. Settings → API
3. Copia: Project URL y anon public key
4. Pega en Vercel Environment Variables
```

### 2.4 Deploy Inicial

Click **"Deploy"** y espera ~2-3 minutos. Vercel te dará una URL temporal:
```
https://clickstore.vercel.app
```

---

## 3. PASO 2: CONECTAR DOMINIO PERSONALIZADO

### 3.1 En Vercel

1. Ve a **Project Settings** → **Domains**
2. Click **"Add Domain"**
3. Escribe: `storesclick.site`
4. Vercel te mostrará 2 opciones:

#### Opción A: Cambiar Nameservers (Recomendado)
```
Nameservers de Vercel:
- ns1.vercel-dns.com
- ns2.vercel-dns.com
- ns3.vercel-dns.com
- ns4.vercel-dns.com
```

**Pasos:**
1. Edit nameservers en tu registrador (GoDaddy, Namecheap, etc.)
2. Reemplaza los nameservers actuales con los de Vercel
3. Espera 24-48 horas para propagación DNS

#### Opción B: Cambiar CNAME (Alternativa)
Si prefieres mantener otros servicios en tu registrador:

```
CNAME: storesclick.site → cname.vercel-dns.com
A Record: @ → 76.76.19.132 (IP de Vercel)
```

### 3.2 Verificar Conexión

```bash
# En terminal, verifica DNS:
nslookup storesclick.site
# Debe mostrar: 76.76.19.132 o vercel-dns.com
```

Vercel mostrará ✅ **"Domain Connected"** en ~30 minutos

---

## 4. PASO 3: CONFIGURAR SSL/TLS

Vercel automáticamente:
- ✅ Genera certificado SSL Let's Encrypt
- ✅ Redirige HTTP → HTTPS
- ✅ Habilita HTTP/2

**No requiere configuración manual.**

---

## 5. PASO 4: VARIABLES DE ENTORNO FINALES

Actualiza en **Project Settings → Environment Variables**:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxx...
VITE_APP_URL=https://storesclick.site
NEXT_PUBLIC_SITE_URL=https://storesclick.site (si uses Next.js)
NODE_ENV=production
```

---

## 6. PASO 5: CONFIGURAR REDIRECTS (`.vercel.json`)

Crea archivo `vercel.json` en raíz del proyecto:

```json
{
  "env": {
    "VITE_SUPABASE_URL": "@vite_supabase_url",
    "VITE_SUPABASE_ANON_KEY": "@vite_supabase_anon_key",
    "VITE_APP_URL": "https://storesclick.site"
  },
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api.storesclick.site/:path*"
    }
  ],
  "redirects": [
    {
      "source": "/",
      "destination": "https://storesclick.site",
      "permanent": true
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        },
        {
          "key": "Cache-Control",
          "value": "public, max-age=3600, s-maxage=3600"
        }
      ]
    }
  ]
}
```

Commit y push a GitHub:
```bash
git add vercel.json
git commit -m "🔧 Configure Vercel deployment"
git push origin main
```

---

## 7. PASO 6: CONFIGURAR REGLAS SUPABASE CORS

Tu app usará `storesclick.site`, así que agrega a Supabase:

1. **Supabase Dashboard** → **Settings** → **API**
2. Encuentra **"Allowed Redirect URLs"**
3. Agrega:
```
https://storesclick.site
https://storesclick.site/*
https://*.storesclick.site/*
```

---

## 8. CHECKLIST PRE-PRODUCCIÓN

- [ ] Dominio conectado en Vercel ✅
- [ ] SSL/TLS activo (🔒 https://)
- [ ] Variables de entorno configuradas
- [ ] Nameservers/CNAME actualizados
- [ ] DNS propagación completada (24-48h)
- [ ] Supabase CORS configurado
- [ ] README.md actualizado con instrucciones
- [ ] `.env.example` creado (sin datos sensibles)
- [ ] Tests básicos pasados en `storesclick.site`

---

## 9. MONITOREO & LOGS

### Ver Logs en Vercel
```
Project Settings → Monitoring → Function Logs
```

### Ver Deployments
```
Deployments tab → Ver histórico de cambios
```

### Rollback (si algo falla)
```
Deployments → Click en versión anterior → "Redeploy"
```

---

## 10. AUTOMATIZACIÓN - DEPLOY AUTOMÁTICO

**Cada push a `main` hace deploy automático:**

```bash
# Local:
git add .
git commit -m "✨ Mejoras de seguridad y optimización"
git push origin main

# En Vercel (automático):
# 1. Detecta cambios
# 2. Instala dependencias
# 3. Build
# 4. Deploy a storesclick.site
# 5. Notifica resultado
```

---

## 11. PERFORMANCE TIPS

### 11.1 Habilitar Edge Caching
```json
// En vercel.json
{
  "headers": [
    {
      "source": "/js/(.*)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

### 11.2 Optimizar Imágenes
Usa Vercel Image Optimization:
```html
<!-- Antes -->
<img src="image.jpg" />

<!-- Después -->
<img src="image.jpg" loading="lazy" decoding="async" />
```

### 11.3 Monitorear Web Vitals
Vercel mostrará automáticamente:
- **LCP** (Largest Contentful Paint)
- **FID** (First Input Delay)
- **CLS** (Cumulative Layout Shift)

---

## 12. TROUBLESHOOTING

| Problema | Solución |
|----------|----------|
| ❌ Domain shows "DNS Not Found" | Espera 24-48h o verifica nameservers |
| ❌ 404 en archivos estáticos | Verifica `vercel.json` rewrites |
| ❌ Variables de entorno no cargan | Redeploy después de agregar `.env` |
| ❌ Error CORS desde Supabase | Agrega dominio a Supabase CORS |
| ❌ Build falla | Revisa logs en Deployments → Show Logs |

---

## 13. GUÍA RÁPIDA (5 MINUTOS)

```bash
# 1. Conectar repo
# - vercel.com → Add Project → Select GitHub repo → Import

# 2. Agregar variables
# Project Settings → Environment Variables → Agregar VITE_*

# 3. Conectar dominio
# Project Settings → Domains → Add → storesclick.site

# 4. Verificar DNS (en tu registrador)
# Nameservers: ns1-ns4.vercel-dns.com

# 5. Esperar propagación (24-48h)
# Status en Vercel: "Connected" ✅

# 6. Agregar vercel.json (security headers)
# git add vercel.json && git commit && git push

# ¡Listo! 🚀
```

---

## 14. SIGUIENTES PASOS

- [ ] **Monitoring**: Configurar alertas en Vercel
- [ ] **Cache**: Optimizar estrategia de caché
- [ ] **CDN Global**: Vercel distribuye automáticamente en 280+ ciudades
- [ ] **Backup**: Configurar deploys automáticos desde GitHub

---

## CONTACTO SOPORTE

- **Vercel Help**: https://vercel.com/help
- **Supabase Docs**: https://supabase.com/docs
- **DNS Propagation**: https://www.whatsmydns.net


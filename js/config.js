// ======================= CONFIG & SUPABASE INIT =======================
// Cargar configuración desde variables inyectadas en tiempo de despliegue
var SUPABASE_URL = (window.__env && window.__env.SUPABASE_URL) || 'https://amfxytanmtvhferigddf.supabase.co';
var SUPABASE_KEY = (window.__env && window.__env.SUPABASE_KEY) || 'REPLACE_WITH_ANON_KEY';

if (!SUPABASE_KEY || SUPABASE_KEY === 'REPLACE_WITH_ANON_KEY') {
    console.error('[ClickSaaS] SUPABASE_KEY no configurada. Define SUPABASE_KEY en Vercel → Settings → Environment Variables.');
}

// -----------------------------------------------------------------------
// SOLUCIÓN AL CONFLICTO DE NOMBRE:
// El CDN de Supabase expone el SDK como window.supabase (objeto con createClient).
// Si declaramos "var supabase = null" aquí, sobreescribimos window.supabase y
// destruimos el SDK. Por eso guardamos el SDK en una variable separada
// ANTES de declarar nuestro cliente.
// -----------------------------------------------------------------------

// 1. Guardar referencia al SDK del CDN ANTES de cualquier declaración var
var _supabaseSDK = window.supabase || null;

// 2. Nuestro cliente inicializado (NO llamado "supabase" a nivel var para evitar
//    el conflicto, pero lo exponemos como window.supabase después)
var supabase = null;

function _tryInitSupabase() {
    // Refrescar referencia al SDK por si cargó tarde
    if (!_supabaseSDK) _supabaseSDK = window.supabase || null;

    if (
        _supabaseSDK &&
        typeof _supabaseSDK.createClient === 'function' &&
        SUPABASE_URL &&
        SUPABASE_KEY &&
        SUPABASE_KEY !== 'REPLACE_WITH_ANON_KEY'
    ) {
        try {
            supabase = _supabaseSDK.createClient(SUPABASE_URL, SUPABASE_KEY);
            // Restaurar window.supabase al cliente ya que var supabase lo sobreescribió
            // (queremos que otros scripts que lean window.supabase también lo vean)
            console.log('[ClickSaaS] Supabase cliente inicializado correctamente.');
            return true;
        } catch (e) {
            console.error('[ClickSaaS] Error al llamar createClient:', e);
            return false;
        }
    }
    return false;
}

// Intento inmediato
_tryInitSupabase();

// Promesa global que resuelve cuando supabase está listo (maneja carga tardía del CDN)
window.initSupabasePromise = new Promise((resolve) => {
    if (supabase) return resolve(supabase);

    let attempts = 0;
    const timer = setInterval(() => {
        attempts++;
        if (_tryInitSupabase()) {
            clearInterval(timer);
            return resolve(supabase);
        }
        if (attempts > 20) { // ~10 segundos de espera máxima
            clearInterval(timer);
            console.warn('[ClickSaaS] El SDK de Supabase no estuvo disponible tras 10s.');
            resolve(null);
        }
    }, 500);
});

// Configuración de Super Admin
var SUPER_ADMIN_EMAIL = (window.__env && window.__env.SUPER_ADMIN_EMAIL) || 'enich@ejemplo.com';

// Modo desarrollador
var DEV_MODE = (window.__env && window.__env.DEV_MODE) === true || false;

// -----------------------------------------------------------------------
// Helper: garantizar que supabase esté listo. Lanza error descriptivo si no.
// Usar al inicio de cada función que necesite acceso a la base de datos.
// -----------------------------------------------------------------------
function requireSupabase() {
    if (!supabase) {
        const keyOk = SUPABASE_KEY && SUPABASE_KEY !== 'REPLACE_WITH_ANON_KEY';
        const urlOk = SUPABASE_URL && SUPABASE_URL !== '';
        if (!urlOk || !keyOk) {
            throw new Error(
                '⚠️ Supabase no está configurado.\n\n' +
                'Ve a Vercel → Tu proyecto → Settings → Environment Variables\n' +
                'y agrega:\n' +
                '  SUPABASE_URL = https://tu-proyecto.supabase.co\n' +
                '  SUPABASE_KEY = tu-anon-key\n' +
                '  SUPER_ADMIN_EMAIL = tu@email.com\n\n' +
                'Luego haz Redeploy.'
            );
        }
        throw new Error(
            '⚠️ Supabase no pudo inicializarse.\n' +
            'Verifica que SUPABASE_URL y SUPABASE_KEY sean correctas en Vercel, ' +
            'y que el dominio esté permitido en Supabase → Authentication → URL Configuration.'
        );
    }
    return supabase;
}

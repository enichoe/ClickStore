// ======================= CONFIG & SUPABASE INIT =======================
// Credenciales fijas para evitar errores de despliegue en Vercel
const SUPABASE_URL = 'https://amfxytanmtvhferigddf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtZnh5dGFubXR2aGZlcmlnZGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzUxNDEsImV4cCI6MjA4ODc1MTE0MX0.f_JyiyGJ2uNPBF-UOffBYDQKPHRvlPVh89Mfo1qibmo';

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
        SUPABASE_KEY
    ) {
        try {
            supabase = _supabaseSDK.createClient(SUPABASE_URL, SUPABASE_KEY);
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
var SUPER_ADMIN_EMAIL = 'ernichoespinoza@gmail.com';

// Modo desarrollador
var DEV_MODE = false;

// -----------------------------------------------------------------------
// Helper: garantizar que supabase esté listo. Lanza error descriptivo si no.
// Usar al inicio de cada función que necesite acceso a la base de datos.
// -----------------------------------------------------------------------
function requireSupabase() {
    if (!supabase) {
        const msg = '⚠️ Supabase no pudo inicializarse. Revisa la consola para más detalles.';
        console.error(msg);
        throw new Error(msg);
    }
    return supabase;
}

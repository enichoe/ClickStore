// ======================= CONFIG & SUPABASE INIT =======================
// Cargar configuración desde variables inyectadas en tiempo de despliegue
var SUPABASE_URL = (window.__env && window.__env.SUPABASE_URL) || 'https://amfxytanmtvhferigddf.supabase.co';
var SUPABASE_KEY = (window.__env && window.__env.SUPABASE_KEY) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtZnh5dGFubXR2aGZlcmlnZGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzUxNDEsImV4cCI6MjA4ODc1MTE0MX0.f_JyiyGJ2uNPBF-UOffBYDQKPHRvlPVh89Mfo1qibmo';

if (!SUPABASE_KEY || SUPABASE_KEY === 'REPLACE_WITH_ANON_KEY' || SUPABASE_KEY === '') {
    const errorMsg = '[StoreClick] CONFIGURACIÓN REQUERIDA: La SUPABASE_KEY no está configurada.\n\n' +
        '1. Local: Edita js/env.js con tus claves.\n' +
        '2. Producción: Configura SUPABASE_URL y SUPABASE_KEY en las variables de entorno de Vercel.\n\n' +
        'Sin esto, el sistema no podrá crear tiendas ni guardar datos.';
    console.error(errorMsg);
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
        const keyOk = SUPABASE_KEY && SUPABASE_KEY !== 'REPLACE_WITH_ANON_KEY' && SUPABASE_KEY !== '';
        const urlOk = SUPABASE_URL && SUPABASE_URL !== '';
        if (!urlOk || !keyOk) {
            const msg = '⚠️ Configuración de Supabase incompleta. ' + 
                       (!urlOk ? 'Falta URL. ' : '') + 
                       (!keyOk ? 'Falta Key. ' : '') + 
                       '\n\nSi estás en Vercel, agrega SUPABASE_URL y SUPABASE_KEY en Settings > Environment Variables.';
            console.error(msg);
            throw new Error(msg);
        }
        throw new Error('⚠️ Supabase no pudo inicializarse. Revisa la consola para más detalles.');
    }
    return supabase;
}

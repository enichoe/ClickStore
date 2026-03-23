/**
 * js/config.js
 * Configuración centralizada de la aplicación.
 * Ahora lee desde window.__env (generado dinámicamente o definido en js/env.js)
 */

// 1. Leer variables desde el scope global de window.__env (inyectado por env.js)
const env = window.__env || {};

const SUPABASE_URL = env.SUPABASE_URL || '';
const SUPABASE_KEY = env.SUPABASE_KEY || '';

// Configuración de negocio
var SUPER_ADMIN_EMAIL = env.SUPER_ADMIN_EMAIL || '';
var DEV_MODE = env.DEV_MODE || false;

// -----------------------------------------------------------------------
// Inicialización Segura del SDK de Supabase
// -----------------------------------------------------------------------
var _supabaseSDK = window.supabase || null;
var supabase = null;

function _tryInitSupabase() {
    if (!_supabaseSDK) _supabaseSDK = window.supabase || null;

    if (
        _supabaseSDK &&
        typeof _supabaseSDK.createClient === 'function' &&
        SUPABASE_URL &&
        SUPABASE_KEY
    ) {
        try {
            supabase = _supabaseSDK.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('[ClickSaaS] ✓ Supabase cliente inicializado correctamente.');
            return true;
        } catch (e) {
            console.error('[ClickSaaS] ❌ Error inicializando Supabase:', e);
            return false;
        }
    }
    return false;
}

// Intento inmediato
_tryInitSupabase();

// Promesa global para manejar carga tardía
window.initSupabasePromise = new Promise((resolve) => {
    if (supabase) return resolve(supabase);

    let attempts = 0;
    const timer = setInterval(() => {
        attempts++;
        if (_tryInitSupabase()) {
            clearInterval(timer);
            return resolve(supabase);
        }
        if (attempts > 20) {
            clearInterval(timer);
            console.warn('[ClickSaaS] Supabase SDK no disponible tras 10s.');
            resolve(null);
        }
    }, 500);
});

function requireSupabase() {
    if (!supabase) {
        throw new Error('⚠️ Supabase no pudo inicializarse. Revisa las variables de entorno.');
    }
    return supabase;
}

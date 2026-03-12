// Cargar configuración desde variables inyectadas en tiempo de despliegue
var SUPABASE_URL = (window.__env && window.__env.SUPABASE_URL) || (window.SUPABASE_URL) || 'https://amfxytanmtvhferigddf.supabase.co';
var SUPABASE_KEY = (window.__env && window.__env.SUPABASE_KEY) || (window.SUPABASE_KEY) || 'REPLACE_WITH_ANON_KEY';

if (!SUPABASE_KEY || SUPABASE_KEY === 'REPLACE_WITH_ANON_KEY') {
	console.error('Supabase key no configurada. Define SUPABASE_KEY en las variables de entorno de Vercel o expone window.__env.SUPABASE_KEY.');
}

var supabase = null;
try {
	if (window.supabase && typeof window.supabase.createClient === 'function' && SUPABASE_URL && SUPABASE_KEY) {
		supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
		console.log('Supabase initialized');
	} else {
		// More detailed diagnostic log to help debugging when CDN fails or global is null
		console.warn('Supabase SDK no disponible o configuración incompleta. Muchas funcionalidades fallarán.');
		console.warn('window.supabase value:', window.supabase);
	}
} catch (err) {
	console.error('Error inicializando Supabase:', err);
}

// Crear una promesa global que resuelve cuando supabase queda disponible (útil si el UMD se carga tarde)
window.initSupabasePromise = window.initSupabasePromise || new Promise((resolve) => {
	if (supabase) return resolve(supabase);
	if (window.supabase && typeof window.supabase.createClient === 'function') {
		supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
		console.log('Supabase initialized (immediate)');
		return resolve(supabase);
	}

	let attempts = 0;
	const timer = setInterval(() => {
		attempts++;
		try {
			if (window.supabase && typeof window.supabase.createClient === 'function') {
				supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
				console.log('Supabase initialized (delayed)');
				clearInterval(timer);
				return resolve(supabase);
			}
		} catch (e) {
			console.error('Delayed supabase init error:', e);
		}
		if (attempts > 20) { // ~10s timeout
			clearInterval(timer);
			console.warn('Supabase SDK did not become available after waiting.');
			return resolve(null);
		}
	}, 500);
});

// Expose a manual initializer so tests or delayed script injection can trigger initialization
window.initSupabaseNow = function() {
	try {
		if (supabase) return supabase;
		if (window.supabase && typeof window.supabase.createClient === 'function') {
			supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
			console.log('Supabase initialized (manual)');
			return supabase;
		}
	} catch (e) {
		console.error('initSupabaseNow error:', e);
	}
	return null;
};

// Configuración de Super Admin (leer de entorno si está disponible)
var SUPER_ADMIN_EMAIL = (window.__env && window.__env.SUPER_ADMIN_EMAIL) || (window.SUPER_ADMIN_EMAIL) || 'enich@ejemplo.com';

// MODO DESARROLLADOR: activar mediante variable de entorno en desarrollo
var DEV_MODE = (window.__env && window.__env.DEV_MODE) || (window.DEV_MODE) || false;

// Helper: verificar que supabase esté listo antes de cualquier operación
// Lanza un error claro si no está configurado (en lugar del críptico "null")
function requireSupabase() {
    if (!supabase) {
        const keyOk  = SUPABASE_KEY  && SUPABASE_KEY  !== 'REPLACE_WITH_ANON_KEY';
        const urlOk  = SUPABASE_URL  && SUPABASE_URL  !== '';
        if (!urlOk || !keyOk) {
            throw new Error(
                'Supabase no está configurado. ' +
                'Ve a Vercel → Settings → Environment Variables y define:\n' +
                '· SUPABASE_URL\n· SUPABASE_KEY\n· SUPER_ADMIN_EMAIL\n' +
                'Luego redespliega el proyecto.'
            );
        }
        throw new Error('Supabase no pudo inicializarse. Recarga la página o revisa la consola.');
    }
    return supabase;
}

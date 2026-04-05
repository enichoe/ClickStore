/**
 * ClickStore View Manager
 * Dynamically loads HTML fragments into the application shell.
 */

const VIEW_FILES = [
    'views/landing.html',
    'views/auth.html',
    'views/admin.html',
    'views/store.html',
    'views/error.html',
    'views/modal-product.html',
    'views/superadmin.html',
    'views/modals-store.html',
    'views/faq.html',
    'views/manual.html',
    'views/politicas.html',
    'views/privacidad.html'
];

/**
 * Fetches content with retry mechanism
 * @param {string} url - The URL to fetch
 * @param {number} retries - Number of remaining retries
 */
async function fetchWithRetry(url, retries = 3) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`[Fetch] ✗ HTTP ${response.status} para ${url}`);
            throw new Error(`HTTP ${response.status} for ${url}`);
        }
        console.log(`[Fetch] ✓ ${url}`);
        return await response.text();
    } catch (err) {
        if (retries > 0) {
            console.warn(`[Fetch] ⟳ Reintentando ${url} (${retries} intentos restantes)...`);
            return await fetchWithRetry(url, retries - 1);
        }
        console.error(`[Fetch] ✗ Error crítico cargando ${url}:`, err.message);
        throw err;
    }
}

/**
 * Loads all views in parallel and initializes the app
 */
async function initializeViews() {
    const loader = document.getElementById('initial-loader');
    const appRoot = document.getElementById('app-root');
    const errorRoot = document.getElementById('view-error-root');

    if (!appRoot) {
        console.error('[ViewManager] ¡#app-root no existe en el DOM!');
        return;
    }

    try {
        console.log('[ViewManager] Iniciando carga de vistas...');
        
        // Load all views in parallel
        const viewContents = await Promise.all(
            VIEW_FILES.map(path => fetchWithRetry(path))
        );

        console.log(`[ViewManager] ✓ ${viewContents.length} vistas cargadas exitosamente`);

        // Inject content
        appRoot.innerHTML = viewContents.join('\n');
        
        console.log('[ViewManager] ✓ HTML inyectado en DOM');
        console.log('[ViewManager] Elementos en DOM:', {
            viewStore: !!document.getElementById('view-store'),
            viewAdmin: !!document.getElementById('view-admin'),
            viewLanding: !!document.getElementById('view-landing')
        });

        // Hide loader with fade-out
        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }

        // Dar tiempo a que se procese el DOM completamente (microqueue + pequeña espera)
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('[ViewManager] ✓ DOM procesado. Ejecutando checkSession()...');

        // Initialize application checkSession()
        if (typeof checkSession === 'function') {
            checkSession();
        } else {
            console.warn('[ViewManager] checkSession function no encontrada. Volviendo a intentar...');
            // Reintentar después de un pequeño delay
            setTimeout(() => {
                if (typeof checkSession === 'function') {
                    checkSession();
                } else {
                    console.error('[ViewManager] checkSession aún no disponible');
                }
            }, 500);
        }

    } catch (error) {
        console.error('[ViewManager] Error crítico cargando vistas:', error);
        if (loader) loader.style.display = 'none';
        if (errorRoot) {
            errorRoot.style.display = 'flex';
            const errorMsg = document.getElementById('error-message');
            if (errorMsg) errorMsg.innerText = `Error: ${error.message}`;
        }
    }
}

// Start loading when DOM is ready (o inmediatamente si ya está listo)
console.log('[ViewManager] views.js cargado. document.readyState:', document.readyState);

// Usar requestAnimationFrame para asegurar que los handlers estén listos
if (document.readyState === 'loading') {
    console.log('[ViewManager] Esperando DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[ViewManager] DOMContentLoaded disparado, iniciando vistas...');
        initializeViews();
    });
} else {
    console.log('[ViewManager] DOM ya está listo, ejecutando initializeViews() ahora...');
    // Usar setTimeout para asegurar que todos los scripts estén listos
    setTimeout(initializeViews, 0);
}

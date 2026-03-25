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
    'views/manual.html'
];

/**
 * Fetches content with retry mechanism
 * @param {string} url - The URL to fetch
 * @param {number} retries - Number of remaining retries
 */
async function fetchWithRetry(url, retries = 3) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
        return await response.text();
    } catch (err) {
        if (retries > 0) {
            console.warn(`Retrying load for ${url} (${retries} left)...`);
            return await fetchWithRetry(url, retries - 1);
        }
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

    try {
        // Load all views in parallel
        const viewContents = await Promise.all(
            VIEW_FILES.map(path => fetchWithRetry(path))
        );

        // Inject content
        appRoot.innerHTML = viewContents.join('\n');

        // Hide loader with fade-out
        if (loader) {
            loader.classList.add('fade-out');
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }

        // Initialize application checkSession()
        if (typeof checkSession === 'function') {
            checkSession();
        } else {
            console.warn('checkSession function not found in loaded scripts.');
        }

    } catch (error) {
        console.error('Critical error loading views:', error);
        if (loader) loader.style.display = 'none';
        if (errorRoot) {
            errorRoot.style.display = 'flex';
            const errorMsg = document.getElementById('error-message');
            if (errorMsg) errorMsg.innerText = `Error: ${error.message}`;
        }
    }
}

// Start loading when DOM is ready
document.addEventListener('DOMContentLoaded', initializeViews);

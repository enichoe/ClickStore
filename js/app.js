// ==================================================================================
// APP.JS - CONTROLADOR PRINCIPAL DE NAVEGACIÓN Y GESTIÓN DE VISTAS
// ==================================================================================
// Este archivo es el corazón de la aplicación. Gestiona:
// - Cambio entre vistas principales (landing, admin, tienda pública, etc.)
// - Visibilidad de modales y formularios
// - Sincronización de secciones dentro de cada vista
// - Estado visual de componentes de navegación
// ==================================================================================

// ======================= ESTADO GLOBAL DE LA APLICACIÓN =======================
// Almacena toda la información que necesita la app: sesión, datos del tenant, 
// productos, carrito, preferencias del usuario, etc.
let appState = {
    session: null,                  // Datos de sesión del usuario (si está logueado)
    tenant: null,                   // Información de la tienda: nombre, logo, colores, URLs
    products: [],                   // Lista de productos de la tienda
    categories: [],                 // Categorías de productos
    cart: [],                       // Carrito de compras del cliente
    selectedCategory: 'all',        // Categoría actualmente filtrada
    deliveryOption: 'pickup'        // Opción elegida: 'pickup' o 'delivery'
};

// ======================= GESTOR DE VISTAS PRINCIPAL =======================
/**
 * syncWhatsAppButton() - Controla la visibilidad del botón flotante de WhatsApp
 * El botón solo debe verse en la landing page. En otras vistas queda oculto.
 * @param {string} viewId - ID de la vista actual
 */
function syncWhatsAppButton(viewId) {
    const waBtn = document.querySelector('.whatsapp-float');
    if (!waBtn) return;
    if (viewId === 'view-landing') {
        waBtn.style.display = '';   // Mostrar botón en landing
    } else {
        waBtn.style.display = 'none'; // Ocultar en otras vistas
    }
}

/**
 * showView() - Cambiar entre vistas principales de la aplicación
 * Gestiona la visibilidad de vistas completas y modales.
 * Rutas principales: Landing → Tienda Pública → Admin → Super Admin
 * 
 * @param {string} viewId - ID de la vista a mostrar (ej: 'view-store', 'view-admin')
 * @param {string} sectionId - (Opcional) Sección específica dentro de la vista (ej: 'products', 'settings')
 */
}

function showAdminSection(section) {
    // Restringido a #view-admin para no afectar secciones del Super Admin
    document.querySelectorAll('#view-admin [id^="section-"]').forEach(el => el.style.display = 'none');
    const targetSection = document.getElementById('section-' + section);
    if (targetSection) targetSection.style.display = 'block';
    
    document.querySelectorAll('#view-admin .nav-item').forEach(item => {
        if (item.getAttribute('onclick')?.includes(`'${section}'`)) {
            item.classList.add('active');
        }
    });

    // Sincronizar Bottom Nav
    document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        if (item.getAttribute('onclick')?.includes(`'${section}'`)) {
            item.classList.add('active');
        }
    });
    
    if (section === 'settings' && typeof generateQR === 'function') generateQR();
    if (section === 'super' && typeof fetchGlobalStores === 'function') fetchGlobalStores();
    
    // Auto-close sidebar on mobile after selection
    if (window.innerWidth <= 768 && typeof toggleSidebar === 'function') {
        toggleSidebar(false);
    }
    
    localStorage.setItem('clickSaaS_lastSection', section);
}

function showSuperAdminSection(section) {
    document.querySelectorAll('#view-superadmin [id^="section-super-"]').forEach(el => el.style.display = 'none');
    const targetSection = document.getElementById('section-super-' + section);
    if (targetSection) targetSection.style.display = 'block';
    
    document.querySelectorAll('#view-superadmin .nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('#view-superadmin .nav-item').forEach(item => {
        if (item.getAttribute('onclick')?.includes(`'${section}'`)) {
            item.classList.add('active');
        }
    });
}

// ======================= UTILS = [loading helper] =======================
function setLoading(btnOrId, isLoading) {
    const btn = (typeof btnOrId === 'string') ? document.getElementById(btnOrId) : btnOrId;
    if (!btn) return;
    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerText;
        btn.innerHTML = `<span class="spinner"></span> Cargando...`;
    } else {
        btn.disabled = false;
        btn.innerText = btn.dataset.originalText || btn.innerText;
    }
}

// ======================= INIT =======================
// = [currency helper] =
function getCurrencySymbol(currency) {
    if (!currency) return 'S/. ';
    const symbols = {
        'USD': '$',
        'PEN': 'S/. ',
        'MXN': '$',
        'COP': '$',
        'EUR': '€',
        'ARS': '$'
    };
    return symbols[currency] || 'S/. ';
}

// = [UI Helpers] =
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';
    if (type === 'info') icon = 'ℹ️';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Compresión de imágenes client-side para optimizar carga y almacenamiento
 */
async function compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (blob) {
                        const compressedFile = new File([blob], file.name, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(compressedFile);
                    } else {
                        reject(new Error('Error al comprimir imagen'));
                    }
                }, 'image/jpeg', quality);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// ======================= GLOBAL ERROR HANDLING =======================
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
    showToast('❌ Algo salió mal. Por favor intenta de nuevo.', 'error');
});

window.addEventListener('error', (event) => {
    console.error('Global Error:', event.error);
    // Solo mostrar toast para errores críticos que no sean de red/extensiones
    if (event.error) showToast('⚠️ Error inesperado en la aplicación.', 'error');
});

// Note: checkSession is now called by views.js after dynamic views are loaded.


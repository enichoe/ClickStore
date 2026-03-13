// ======================= CORE DATA =======================
let appState = {
    session: null,
    tenant: null, // Info de la tienda
    products: [],
    categories: [],
    cart: [],
    selectedCategory: 'all',
    deliveryOption: 'pickup'
};

// ======================= VIEW CONTROLLER =======================
async function showView(viewId, sectionId = null) {
    document.querySelectorAll('#view-landing, #view-admin, #view-store, #view-superadmin, .modal, #view-error').forEach(el => {
        if (!el.classList.contains('modal')) el.style.display = 'none';
        else el.classList.remove('active');
    });

    if (viewId === 'view-admin') {
        localStorage.setItem('clickSaaS_lastView', viewId);
        if (sectionId) localStorage.setItem('clickSaaS_lastSection', sectionId);
    }

    const target = document.getElementById(viewId);
    if (target) {
        if (target.classList.contains('modal')) {
            target.classList.add('active');
        } else {
            target.style.display = 'block';
        }
    }

    if (viewId === 'view-admin' && sectionId) {
        showAdminSection(sectionId);
    }
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
    if (!currency) return '$';
    const symbols = {
        'USD': '$',
        'PEN': 'S/',
        'MXN': '$',
        'COP': '$',
        'EUR': '€',
        'ARS': '$'
    };
    return symbols[currency] || '$';
}

// = [UI Helpers] =
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `fade-in`;
    toast.style.cssText = `
        background: ${type === 'success' ? '#10B981' : '#EF4444'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-weight: 500;
        min-width: 200px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        animation: slideIn 0.3s ease-out;
    `;
    
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

window.addEventListener('load', () => {
    if (typeof checkSession === 'function') {
        checkSession();
    }
});

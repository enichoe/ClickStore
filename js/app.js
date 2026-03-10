// ======================= CORE DATA =======================
let appState = {
    session: null,
    tenant: null, // Info de la tienda
    products: [],
    orders: [],
    cart: []
};

// ======================= VIEW CONTROLLER =======================
async function showView(viewId, sectionId = null) {
    document.querySelectorAll('#view-landing, #view-admin, #view-store, .modal, #view-error').forEach(el => {
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
    document.querySelectorAll('[id^="section-"]').forEach(el => el.style.display = 'none');
    const targetSection = document.getElementById('section-' + section);
    if (targetSection) targetSection.style.display = 'block';
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.getAttribute('onclick')?.includes(`'${section}'`)) {
            item.classList.add('active');
        }
    });
    
    if (section === 'settings' && typeof generateQR === 'function') generateQR();
    localStorage.setItem('clickSaaS_lastSection', section);
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
window.addEventListener('load', () => {
    if (typeof checkSession === 'function') {
        checkSession();
    }
});

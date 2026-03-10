// ======================= STOREFRONT =======================
async function loadPublicStore(storeId) {
    try {
        const { data: store, error: sErr } = await supabase.from('stores').select('*').eq('id', storeId).single();
        if (sErr || !store) throw new Error("Tienda no encontrada");

        const { data: prods, error: pErr } = await supabase.from('products').select('*').eq('store_id', storeId);
        
        appState.tenant = store;
        appState.products = prods || [];
        
        renderStorefront();
        showView('view-store');
    } catch (err) {
        const errorView = document.getElementById('view-error');
        if (errorView) errorView.style.display = 'flex';
        showView('view-error');
    }
}

function openStorefront() {
    if (!appState.tenant) return;
    window.open(window.location.origin + window.location.pathname + '?store=' + appState.tenant.id, '_blank');
}

function renderStorefront() {
    const navTitle = document.getElementById('store-title-nav');
    const mainTitle = document.getElementById('store-title-main');
    if (navTitle) navTitle.innerText = appState.tenant.name;
    if (mainTitle) mainTitle.innerText = appState.tenant.name;
    
    const grid = document.getElementById('store-products-grid');
    if (!grid) return;
    grid.innerHTML = appState.products.map(p => `
        <div class="card" style="padding: 0; overflow: hidden; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
            <img src="${p.image || 'https://via.placeholder.com/300'}" style="width: 100%; height: 180px; object-fit: cover;">
            <div style="padding: 16px;">
                <h4 style="font-weight: 600; margin-bottom: 4px;">${p.name}</h4>
                <p style="color: var(--accent); font-weight: 700; font-size: 18px;">$${parseFloat(p.price).toFixed(2)}</p>
                <button class="btn btn-primary w-full" style="margin-top: 12px;" onclick="addToCart(${p.id})">Agregar</button>
            </div>
        </div>
    `).join('');
}

// ======================= CART & ORDERS =======================
function addToCart(id) {
    const product = appState.products.find(p => p.id === id);
    const item = appState.cart.find(c => c.id === id);
    
    if (item) {
        item.qty++;
    } else {
        appState.cart.push({ ...product, qty: 1 });
    }
    updateCartBadge();
}

function updateCartBadge() {
    const count = appState.cart.reduce((sum, i) => sum + i.qty, 0);
    const cartCount = document.getElementById('cart-count');
    if (cartCount) cartCount.innerText = count;
}

function openCart() {
    if (typeof openModal === 'function') openModal('modal-cart');
    const itemsDiv = document.getElementById('cart-items');
    if (!itemsDiv) return;
    let total = 0;
    
    itemsDiv.innerHTML = appState.cart.map(i => {
        total += i.price * i.qty;
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
                <div>
                    <p style="font-weight: 500;">${i.name}</p>
                    <p style="font-size: 12px; color: var(--text-sec);">Cantidad: ${i.qty}</p>
                </div>
                <p style="font-weight: 700;">$${(i.price * i.qty).toFixed(2)}</p>
            </div>
        `;
    }).join('');
    
    const cartTotal = document.getElementById('cart-total');
    if (cartTotal) cartTotal.innerText = '$' + total.toFixed(2);
}

// ======================= QR & UTILS =======================
function generateQR() {
    const linkInput = document.getElementById('store-link-input');
    if (!linkInput) return;
    const url = linkInput.value;
    const container = document.getElementById('qr-container');
    if (!container) return;
    container.innerHTML = ''; 
    if(typeof QRCode !== 'undefined') {
        QRCode.toCanvas(container, url, { width: 150, margin: 2 }, function(error) {
            if (error) console.error(error);
        });
    } else {
        container.innerHTML = '<p style="color: black;">QR Librería no cargada</p>';
    }
}

function copyLink() {
    const input = document.getElementById('store-link-input');
    if (!input) return;
    input.select();
    document.execCommand('copy');
    alert('Enlace copiado!');
}

// Initializer
document.addEventListener('DOMContentLoaded', () => {
    const checkoutForm = document.getElementById('checkout-form');
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');
            const total = appState.cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
            
            const order = {
                store_id: appState.tenant.id,
                customer_name: e.target[0].value,
                whatsapp: e.target[1].value,
                total: total,
                items: JSON.stringify(appState.cart),
                status: 'pending'
            };

            setLoading(btn, true);
            try {
                const { error } = await supabase.from('orders').insert([order]);
                if (error) throw error;
                
                alert('¡Pedido enviado con éxito!');
                appState.cart = [];
                updateCartBadge();
                if (typeof closeModal === 'function') closeModal('modal-cart');
                e.target.reset();
            } catch (err) {
                alert("Error enviando pedido: " + err.message);
            } finally {
                setLoading(btn, false);
            }
        });
    }
});

// ======================= STOREFRONT =======================
async function loadPublicStore(identifier) {
    try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        let query = supabase.from('stores').select('*');
        
        if (isUUID) {
            query = query.eq('id', identifier);
        } else {
            query = query.eq('slug', identifier);
        }

        console.log("Cargando tienda con identificador:", identifier);
        const { data: store, error: sErr } = await query.maybeSingle();
            
        if (sErr) {
            console.error("Error de Supabase cargando tienda (400?):", sErr);
            throw sErr;
        }

        if (!store) throw new Error("Tienda no encontrada");

        console.log("Tienda encontrada:", store.name);
        const { data: prods, error: pErr } = await supabase.from('products').select('*').eq('store_id', store.id);
        if (pErr) console.error("Error cargando productos:", pErr);

        const { data: cats, error: cErr }  = await supabase.from('categories').select('*').eq('store_id', store.id).order('name', { ascending: true });
        if (cErr) console.error("Error cargando categorías (posible causa del 400):", cErr);
        
        appState.tenant = store;
        appState.products = prods || [];
        appState.categories = cats || [];
        
        // Inicializar opción de delivery si está activo
        if (appState.tenant.active_delivery) {
            appState.deliveryOption = 'delivery';
        } else {
            appState.deliveryOption = 'pickup';
        }
        
        renderStorefront();
        showView('view-store');
    } catch (err) {
        console.error("DEBUG - Error detallado:", err);
        const errorView = document.getElementById('view-error');
        if (errorView) {
            errorView.style.display = 'flex';
            errorView.innerHTML = `
                <div style="text-align: center; padding: 40px; background: white; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-width: 400px;">
                    <h2 style="color: #ef4444; margin-bottom: 16px;">Error de Conexión</h2>
                    <p style="color: #64748b; margin-bottom: 24px;">${err.message || 'Error desconocido'}</p>
                    <div style="background: #f8fafc; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 11px; color: #94a3b8; text-align: left; overflow-wrap: break-word;">
                        Código: ${err.code || 'N/A'}<br>
                        Detalle: ${err.details || 'Ver consola para más info'}
                    </div>
                    <button onclick="location.reload()" style="margin-top: 24px; background: var(--accent); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600;">Reintentar</button>
                </div>
            `;
        }
        showView('view-error');
    }
}

function openStorefront() {
    if (!appState.tenant) return;
    const identifier = appState.tenant.slug || appState.tenant.id;
    window.open(window.location.origin + window.location.pathname + '?store=' + identifier, '_blank');
}

function renderStorefront() {
    const navTitle = document.getElementById('store-title-nav');
    const mainTitle = document.getElementById('store-title-main');
    if (navTitle) navTitle.innerText = appState.tenant.name;
    if (mainTitle) mainTitle.innerText = appState.tenant.name;
    
    // Renderizar filtro de categorías
    renderCategoryFilter();
    
    // Símbolo de moneda según configuración de la tienda
    const currencySymbol = getCurrencySymbol(appState.tenant.currency);
    const grid = document.getElementById('store-products-grid');
    if (!grid) return;

    // Filtrar productos
    let filteredProducts = appState.products;
    if (appState.selectedCategory !== 'all') {
        filteredProducts = appState.products.filter(p => p.category_id === appState.selectedCategory);
    }

    if (appState.categories.length > 0 && appState.selectedCategory === 'all') {
        // Renderizar agrupado por categorías (Vista inicial)
        grid.innerHTML = appState.categories.map(cat => {
            const catProds = filteredProducts.filter(p => p.category_id === cat.id);
            if (catProds.length === 0) return '';
            return `
                <div style="grid-column: 1 / -1; margin-top: 32px; border-bottom: 2px solid var(--accent); padding-bottom: 8px;">
                    <h2 style="font-size: 24px;">${cat.name}</h2>
                </div>
                ${catProds.map(p => renderProductCard(p, currencySymbol)).join('')}
            `;
        }).join('');

        const noCatProds = filteredProducts.filter(p => !p.category_id);
        if (noCatProds.length > 0) {
            grid.innerHTML += `
                <div style="grid-column: 1 / -1; margin-top: 32px; border-bottom: 2px solid var(--border); padding-bottom: 8px;">
                    <h2 style="font-size: 24px; color: var(--text-sec);">Otros</h2>
                </div>
                ${noCatProds.map(p => renderProductCard(p, currencySymbol)).join('')}
            `;
        }
    } else {
        // Renderizado simple para filtro activo o si no hay categorías
        grid.innerHTML = filteredProducts.map(p => renderProductCard(p, currencySymbol)).join('');
    }
}

function renderCategoryFilter() {
    const bar = document.getElementById('category-filter-bar');
    if (!bar || appState.categories.length === 0) return;

    const allBtn = `<button class="cat-btn ${appState.selectedCategory === 'all' ? 'active' : ''}" onclick="filterByCategory('all')">Todos</button>`;
    const catBtns = appState.categories.map(c => `
        <button class="cat-btn ${appState.selectedCategory === c.id ? 'active' : ''}" onclick="filterByCategory('${c.id}')">${c.name}</button>
    `).join('');

    bar.innerHTML = allBtn + catBtns;
}

function filterByCategory(id) {
    appState.selectedCategory = id;
    renderStorefront();
}

function renderProductCard(p, currencySymbol) {
    return `
        <div class="store-card animate-slide" style="display: flex; flex-direction: column;">
            <div style="position: relative; height: 150px; overflow: hidden; background: #f8fafc;">
                <img src="${p.image || 'https://via.placeholder.com/300'}" style="width: 100%; height: 100%; object-fit: cover;">
                ${p.active === false ? '<div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.7); display: flex; align-items: center; justify-content: center; font-weight: 800; color: #ef4444; font-size: 13px;">Agotado</div>' : ''}
            </div>
            <div style="padding: 12px; flex-grow: 1; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                    <h4 style="font-size: 0.95rem; font-weight: 700; color: #1e293b; margin-bottom: 4px; line-height: 1.2;">${p.name}</h4>
                    <p style="font-size: 0.75rem; color: #64748b; line-height: 1.4; margin-bottom: 12px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${p.description || 'Sin descripción'}</p>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
                    <span style="font-size: 1.05rem; font-weight: 800; color: var(--accent);">${currencySymbol}${parseFloat(p.price).toFixed(2)}</span>
                    <button class="btn btn-primary" style="padding: 6px 10px; border-radius: 8px; font-weight: 600;" onclick="addToCart('${p.id}')">
                        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
                    </button>
                </div>
            </div>
        </div>
    `;
}

// ======================= CART & ORDERS =======================
function addToCart(id) {
    const product = appState.products.find(p => p.id === id);
    const item = appState.cart.find(c => c.id === id);
    if (!product) return console.warn('Producto no encontrado en addToCart:', id);

    // Asegurar que el precio sea number
    const price = Number(parseFloat(product.price) || 0);
    if (item) {
        item.qty++;
    } else {
        appState.cart.push({ id: product.id, name: product.name, price: price, image: product.image, qty: 1 });
    }
    updateCartBadge();
    showToast(`¡${product.name} añadido al carrito!`);
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
    
    const currencySymbol = getCurrencySymbol(appState.tenant.currency);
    itemsDiv.innerHTML = appState.cart.map(i => {
        total += i.price * i.qty;
        return `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border);">
                <div>
                    <p style="font-weight: 500; font-size: 15px;">${i.name}</p>
                    <div style="display: flex; gap: 8px; margin-top: 4px;">
                         <button onclick="changeQty('${i.id}', -1)" style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid #cbd5e1; background: #fff;">-</button>
                         <span style="font-size: 14px; font-weight: 600;">${i.qty}</span>
                         <button onclick="changeQty('${i.id}', 1)" style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid #cbd5e1; background: #fff;">+</button>
                    </div>
                </div>
                <p style="font-weight: 700; color: #1e293b;">${currencySymbol}${(i.price * i.qty).toFixed(2)}</p>
            </div>
        `;
    }).join('');

    // UI de Delivery Opcional
    const deliveryUI = document.getElementById('delivery-option-ui');
    const summaryLines = document.getElementById('cart-summary-lines');
    let finalTotal = total;

    if (appState.tenant.active_delivery) {
        deliveryUI.style.display = 'block';
        const dPrice = parseFloat(appState.tenant.delivery_price || 0);
        
        // Actualizar estados visuales de los botones
        document.getElementById('btn-opt-delivery').className = `btn btn-sm w-full ${appState.deliveryOption === 'delivery' ? 'btn-primary' : 'btn-secondary'}`;
        document.getElementById('btn-opt-pickup').className = `btn btn-sm w-full ${appState.deliveryOption === 'pickup' ? 'btn-primary' : 'btn-secondary'}`;

        if (appState.deliveryOption === 'delivery') {
            finalTotal += dPrice;
            summaryLines.innerHTML = `
                <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px; color: #64748b;">
                    <span>Subtotal</span>
                    <span>${currencySymbol}${total.toFixed(2)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 14px; color: var(--accent); font-weight: 600;">
                    <span>Envío</span>
                    <span>+ ${currencySymbol}${dPrice.toFixed(2)}</span>
                </div>
            `;
        } else {
            summaryLines.innerHTML = `
                <div style="display: flex; justify-content: space-between; font-size: 14px; color: #64748b;">
                    <span>Recojo en Local</span>
                    <span>${currencySymbol}${(0).toFixed(2)}</span>
                </div>
            `;
        }
    } else {
        deliveryUI.style.display = 'none';
        summaryLines.innerHTML = '';
    }
    
    const cartTotal = document.getElementById('cart-total');
    if (cartTotal) cartTotal.innerText = currencySymbol + finalTotal.toFixed(2);
}

function setDeliveryOption(opt) {
    appState.deliveryOption = opt;
    openCart();
}

function changeQty(id, delta) {
    const item = appState.cart.find(c => c.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
        appState.cart = appState.cart.filter(c => c.id !== id);
    }
    updateCartBadge();
    openCart();
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
    const text = input.value;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => alert('Enlace copiado!')).catch(err => {
            console.error('Clipboard write failed:', err);
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }

    function fallbackCopy(t) {
        try {
            input.select();
            document.execCommand('copy');
            alert('Enlace copiado!');
        } catch (err) {
            console.error('Fallback copy failed:', err);
            alert('No se pudo copiar el enlace automáticamente. Selecciónalo y copia manualmente.');
        }
    }
}

// Initializer
document.addEventListener('DOMContentLoaded', () => {
    const checkoutForm = document.getElementById('checkout-form');
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const btn = e.target.querySelector('button[type="submit"]');

            const customerName = document.getElementById('cust-name').value.trim();
            const customerWhatsapp = document.getElementById('cust-whatsapp').value.trim();
            const customerAddress = document.getElementById('cust-address').value.trim();

            setLoading(btn, true);
            try {
                if (!appState.tenant || !appState.tenant.id) throw new Error('Tienda no definida.');
                if (appState.cart.length === 0) throw new Error('El carrito está vacío.');

                // Validar teléfono del negocio
                const businessPhone = (appState.tenant.whatsapp_phone || '').replace(/\D/g, '');
                if (!businessPhone) throw new Error('Esta tienda no tiene WhatsApp configurado.');

                // Enviar a Supabase RPC
                const deliverySelected = appState.deliveryOption === 'delivery';
                const itemsForRpc = appState.cart.map(i => ({ id: i.id, qty: i.qty }));

                const { data: orderId, error } = await supabase.rpc('create_order', {
                    p_store_id:      appState.tenant.id,
                    p_customer_name: customerName,
                    p_whatsapp:      customerWhatsapp,
                    p_items:         itemsForRpc,
                    p_delivery_selected: deliverySelected
                });

                if (error) throw error;

                // Calcular totales para el mensaje
                const subtotal = appState.cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
                const deliveryFee = deliverySelected ? parseFloat(appState.tenant.delivery_price || 0) : 0;
                const total = subtotal + deliveryFee;

                // Construir mensaje de WhatsApp
                const deliveryType = deliverySelected ? `🛵 Envío a Domicilio` : `🥡 Recojo en Local`;
                const message = [
                    `*🛍️ NUEVO PEDIDO - ${appState.tenant.name}*`,
                    `--------------------------------`,
                    `*Cliente:* ${customerName}`,
                    `*WhatsApp:* ${customerWhatsapp}`,
                    `*Tipo:* ${deliveryType}`,
                    customerAddress ? `*Nota/Dir:* ${customerAddress}` : '',
                    `--------------------------------`,
                    `*PRODUCTOS:*`,
                    appState.cart.map(i => `- ${i.name} x${i.qty}`).join('%0A'),
                    `--------------------------------`,
                    `*Total:* $${total.toFixed(2)}`,
                    `--------------------------------`,
                    `_Enviado desde ClickSaaS_`
                ].filter(Boolean).join('%0A');

                window.open(`https://wa.me/${businessPhone}?text=${message}`, '_blank');

                showToast('¡Pedido enviado!');
                appState.cart = [];
                updateCartBadge();
                if (typeof closeModal === 'function') closeModal('modal-cart');
                e.target.reset();
            } catch (err) {
                alert('Error: ' + err.message);
            } finally {
                setLoading(btn, false);
            }
        });
    }
});

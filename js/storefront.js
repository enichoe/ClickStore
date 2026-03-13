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
    
    const currencySymbol = getCurrencySymbol(appState.tenant.currency);
    const grid = document.getElementById('store-products-grid');
    if (!grid) return;

    // Filtrar productos
    let filteredProducts = (appState.products || []).filter(p => p.active !== false);
    if (appState.selectedCategory !== 'all') {
        filteredProducts = filteredProducts.filter(p => p.category_id === appState.selectedCategory);
    }

    if (filteredProducts.length === 0) {
        grid.innerHTML = '<div class="col-span-full py-20 text-center text-slate-400">No se encontraron productos en esta sección.</div>';
        return;
    }

    if (appState.categories.length > 0 && appState.selectedCategory === 'all') {
        // Renderizar agrupado por categorías (Vista inicial)
        grid.innerHTML = appState.categories.map(cat => {
            const catProds = filteredProducts.filter(p => p.category_id === cat.id);
            if (catProds.length === 0) return '';
            return `
                <div class="col-span-full mt-12 mb-6 border-b border-slate-100 pb-2">
                    <h2 class="text-2xl font-black text-slate-900">${cat.name}</h2>
                </div>
                ${catProds.map(p => renderProductCard(p, currencySymbol)).join('')}
            `;
        }).join('');

        const noCatProds = filteredProducts.filter(p => !p.category_id);
        if (noCatProds.length > 0) {
            grid.innerHTML += `
                <div class="col-span-full mt-12 mb-6 border-b border-slate-100 pb-2">
                    <h2 class="text-2xl font-black text-slate-500">Otros</h2>
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
        <div class="store-card animate-slide flex flex-col h-full bg-white group border border-slate-100 rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500">
            <div class="relative aspect-square overflow-hidden bg-slate-50">
                <img src="${p.image || 'https://via.placeholder.com/300'}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700">
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors"></div>
                ${p.active === false ? '<div class="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex items-center justify-center font-black text-red-500 text-sm uppercase tracking-widest">Agotado</div>' : ''}
            </div>
            <div class="p-5 flex flex-col flex-1">
                <div class="flex-1">
                    <h4 class="text-lg font-bold text-slate-900 mb-1 group-hover:text-indigo-600 transition-colors">${p.name}</h4>
                    <p class="text-xs text-slate-400 mb-4 line-clamp-2 leading-relaxed">${p.description || 'Sin descripción'}</p>
                </div>
                <div class="flex justify-between items-center mt-auto">
                    <span class="text-xl font-black text-slate-900">${currencySymbol}${parseFloat(p.price).toFixed(2)}</span>
                    <button class="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200 hover:bg-slate-900 hover:shadow-indigo-300 transition-all active:scale-90" onclick="addToCart('${p.id}')">
                        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
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

    const price = Number(parseFloat(product.price) || 0);
    if (item) {
        item.qty++;
    } else {
        appState.cart.push({ id: product.id, name: product.name, price: price, image: product.image, qty: 1 });
    }
    updateCartBadge();
    showToast(`🛍️ ${product.name} añadido`);
}

function updateCartBadge() {
    const count = appState.cart.reduce((sum, i) => sum + i.qty, 0);
    const cartCount = document.getElementById('cart-count');
    const cartFloatTotal = document.getElementById('cart-total-float');
    const currencySymbol = getCurrencySymbol(appState.tenant.currency);
    
    if (cartCount) cartCount.innerText = count;
    
    const subtotal = appState.cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    if (cartFloatTotal) cartFloatTotal.innerText = currencySymbol + subtotal.toFixed(2);
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
            <div class="flex gap-4 items-center">
                <div class="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                    <img src="${i.image || 'https://via.placeholder.com/100'}" class="w-full h-full object-cover">
                </div>
                <div class="flex-1">
                    <p class="font-bold text-slate-900 leading-tight mb-1">${i.name}</p>
                    <p class="text-sm text-indigo-600 font-bold">${currencySymbol}${i.price.toFixed(2)}</p>
                </div>
                <div class="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
                     <button onclick="changeQty('${i.id}', -1)" class="w-8 h-8 flex items-center justify-center rounded-md bg-white text-slate-900 font-bold shadow-sm active:scale-90">-</button>
                     <span class="w-4 text-center text-sm font-black">${i.qty}</span>
                     <button onclick="changeQty('${i.id}', 1)" class="w-8 h-8 flex items-center justify-center rounded-md bg-white text-slate-900 font-bold shadow-sm active:scale-90">+</button>
                </div>
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
        const btnDelivery = document.getElementById('btn-opt-delivery');
        const btnPickup = document.getElementById('btn-opt-pickup');
        
        if (appState.deliveryOption === 'delivery') {
            btnDelivery.classList.add('!border-indigo-600', '!bg-indigo-50', '!text-indigo-600');
            btnPickup.classList.remove('!border-indigo-600', '!bg-indigo-50', '!text-indigo-600');
            finalTotal += dPrice;
            summaryLines.innerHTML = `
                <div class="flex justify-between items-center text-sm">
                    <span>Subtotal</span>
                    <span class="font-bold">${currencySymbol}${total.toFixed(2)}</span>
                </div>
                <div class="flex justify-between items-center text-sm text-indigo-600">
                    <span>Costo Envío</span>
                    <span class="font-bold">+ ${currencySymbol}${dPrice.toFixed(2)}</span>
                </div>
            `;
        } else {
            btnPickup.classList.add('!border-indigo-600', '!bg-indigo-50', '!text-indigo-600');
            btnDelivery.classList.remove('!border-indigo-600', '!bg-indigo-50', '!text-indigo-600');
            summaryLines.innerHTML = `
                <div class="flex justify-between items-center text-sm">
                    <span>Subtotal</span>
                    <span class="font-bold">${currencySymbol}${total.toFixed(2)}</span>
                </div>
                <div class="flex justify-between items-center text-sm text-emerald-600">
                    <span>Recojo en Local</span>
                    <span class="font-bold">Gratis</span>
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

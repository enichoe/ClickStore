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

        const { data: store, error: sErr } = await query.maybeSingle();   
        if (sErr) throw sErr;
        if (!store) throw new Error("Tienda no encontrada");

        const { data: prods } = await supabase.from('products').select('*').eq('store_id', store.id);
        const { data: cats }  = await supabase.from('categories').select('*').eq('store_id', store.id).order('name', { ascending: true });
        
        appState.tenant = store;
        appState.products = prods || [];
        appState.categories = cats || [];
        appState.selectedCategory = 'all';
        appState.searchQuery = '';
        
        // Configuración de Delivery
        appState.deliveryOption = appState.tenant.active_delivery ? 'delivery' : 'pickup';
        
        renderStorefront();
        showView('view-store');

        // Mostrar botón Mi Panel si el usuario actual es el dueño
        if (appState.session && appState.session.user.id === store.owner_id) {
            const btn = document.getElementById('btn-back-to-admin');
            if (btn) btn.classList.remove('hidden');
        }

    } catch (err) {
        console.error("DEBUG - Error detallado:", err);
        showView('view-error');
    }
}

function openStorefront() {
    if (!appState.tenant) return;
    const identifier = appState.tenant.slug || appState.tenant.id;
    window.open(window.location.origin + window.location.pathname + '?store=' + identifier, '_blank');
}

function renderStorefront() {
    // 1. Logos y Textos
    const logoImgNav = document.getElementById('store-logo-img');
    const logoImgHero = document.getElementById('store-logo-hero');
    const logoPlaceholderNav = document.getElementById('store-logo-placeholder');
    const logoPlaceholderHero = document.getElementById('store-logo-hero-placeholder');
    
    const initial = appState.tenant.name ? appState.tenant.name[0] : 'T';

    // Header Nav Logo
    if (appState.tenant.logo_url) {
        logoImgNav.src = appState.tenant.logo_url;
        logoImgNav.classList.remove('hidden');
        logoPlaceholderNav.classList.add('hidden');
    } else {
        logoImgNav.classList.add('hidden');
        logoPlaceholderNav.classList.remove('hidden');
        logoPlaceholderNav.innerText = initial;
    }

    // Hero Logo
    if (appState.tenant.logo_url) {
        logoImgHero.src = appState.tenant.logo_url;
        logoImgHero.classList.remove('hidden');
        logoPlaceholderHero.classList.add('hidden');
    } else {
        logoImgHero.classList.add('hidden');
        logoPlaceholderHero.classList.remove('hidden');
        logoPlaceholderHero.innerText = initial;
    }

    document.getElementById('store-title-nav').innerText = appState.tenant.name;
    document.getElementById('store-title-main').innerText = appState.tenant.name;
    document.getElementById('store-tagline').innerText = appState.tenant.description || 'Bienvenido a nuestra tienda virtual.';

    // 2. Filtro de Categorías
    renderCategoryFilter();
    
    // 3. Grid de Productos
    renderProductGrid();
}

function renderCategoryFilter() {
    const bar = document.getElementById('category-filter-bar');
    if (!bar) return;

    if (appState.categories.length === 0) {
        bar.parentElement.classList.add('hidden');
        return;
    }

    bar.parentElement.classList.remove('hidden');
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

function filterStoreProducts() {
    const searchVal = document.getElementById('store-search').value || document.getElementById('store-search-mobile').value || '';
    appState.searchQuery = searchVal.toLowerCase().trim();
    renderProductGrid();
}

function renderProductGrid() {
    const grid = document.getElementById('store-products-grid');
    if (!grid) return;

    const currencySymbol = getCurrencySymbol(appState.tenant.currency);
    
    // Filtrado
    let prods = appState.products.filter(p => p.active !== false);
    
    if (appState.selectedCategory !== 'all') {
        prods = prods.filter(p => p.category_id === appState.selectedCategory);
    }
    
    if (appState.searchQuery) {
        prods = prods.filter(p => p.name.toLowerCase().includes(appState.searchQuery) || (p.description && p.description.toLowerCase().includes(appState.searchQuery)));
    }

    if (prods.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-24 text-center">
                <p class="text-slate-400 text-lg font-medium">No encontramos lo que buscas.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = prods.map(p => `
        <div class="product-card-premium stagger-in group">
            <div class="product-image-container">
                <div class="product-image-inner shadow-sm">
                    <img src="${p.image || 'https://via.placeholder.com/400'}" alt="${p.name}">
                </div>
            </div>
            <div class="p-6 pt-2 flex flex-col flex-1">
                <h4 class="font-bold text-slate-800 mb-1 group-hover:text-indigo-600 transition-colors">${p.name}</h4>
                <p class="text-xs text-slate-400 line-clamp-2 mb-4 leading-relaxed">${p.description || 'Sin descripción'}</p>
                <div class="flex items-center justify-between mt-auto">
                    <span class="text-xl font-black text-slate-900">${currencySymbol}${parseFloat(p.price).toFixed(2)}</span>
                    <button class="btn-add-cart-mini" onclick="addToCart('${p.id}')">
                        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// ======================= DRAWER & CART =======================
function openDrawer(id) {
    const drawer = document.getElementById(id);
    const overlay = document.getElementById('drawer-overlay');
    if (drawer) drawer.classList.add('active');
    if (overlay) overlay.classList.add('active');
    
    if (id === 'drawer-cart') renderCartContent();
}

function closeDrawer(id) {
    const drawer = document.getElementById(id);
    const overlay = document.getElementById('drawer-overlay');
    if (drawer) drawer.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
}

function addToCart(id) {
    const product = appState.products.find(p => p.id === id);
    if (!product) return;

    const existing = appState.cart.find(c => c.id === id);
    if (existing) {
        existing.qty++;
    } else {
        appState.cart.push({
            id: product.id,
            name: product.name,
            price: parseFloat(product.price),
            image: product.image,
            qty: 1
        });
    }

    updateCartBadge();
    showToast(`✅ ${product.name} añadido`);
    
    // Auto abrir carrito si es la primera vez o para feedback
    // openDrawer('drawer-cart'); 
}

function updateCartBadge() {
    const count = appState.cart.reduce((sum, i) => sum + i.qty, 0);
    const subtotal = appState.cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const currency = getCurrencySymbol(appState.tenant.currency);

    document.getElementById('cart-count').innerText = count;
    
    const floatBar = document.getElementById('cart-float-bar');
    if (count > 0) {
        floatBar.classList.remove('hidden');
        document.getElementById('cart-float-total').innerText = currency + subtotal.toFixed(2);
    } else {
        floatBar.classList.add('hidden');
    }
}

function renderCartContent() {
    const itemsDiv = document.getElementById('cart-items');
    if (appState.cart.length === 0) {
        itemsDiv.innerHTML = `
            <div class="py-20 text-center space-y-4">
                <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-200">
                    <svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
                </div>
                <p class="text-slate-400 font-bold">Tu carrito está vacío</p>
            </div>
        `;
    } else {
        const currency = getCurrencySymbol(appState.tenant.currency);
        itemsDiv.innerHTML = appState.cart.map(i => `
            <div class="flex gap-4 group">
                <div class="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-100 shadow-sm">
                    <img src="${i.image || 'https://via.placeholder.com/100'}" class="w-full h-full object-cover">
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-bold text-slate-800 truncate mb-1">${i.name}</p>
                    <p class="text-sm font-black text-indigo-600 mb-2">${currency}${i.price.toFixed(2)}</p>
                    <div class="qty-control">
                        <button class="qty-btn" onclick="changeQty('${i.id}', -1)">-</button>
                        <span class="text-xs font-bold w-4 text-center">${i.qty}</span>
                        <button class="qty-btn" onclick="changeQty('${i.id}', 1)">+</button>
                    </div>
                </div>
                <button class="text-slate-300 hover:text-red-500 self-start p-1" onclick="removeFromCart('${i.id}')">
                    <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        `).join('');
    }

    updateTotals();
}

function updateTotals() {
    const total = appState.cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const currency = getCurrencySymbol(appState.tenant.currency);
    const summaryLines = document.getElementById('cart-summary-lines');
    const deliveryUI = document.getElementById('delivery-option-ui');
    
    let finalTotal = total;

    if (appState.tenant.active_delivery) {
        deliveryUI.classList.remove('hidden');
        const dPrice = parseFloat(appState.tenant.delivery_price || 0);
        
        // Buttons state
        const btnD = document.getElementById('btn-opt-delivery');
        const btnP = document.getElementById('btn-opt-pickup');
        
        if (appState.deliveryOption === 'delivery') {
            btnD.classList.add('!bg-indigo-600', '!text-white', '!border-indigo-600');
            btnP.classList.remove('!bg-indigo-600', '!text-white', '!border-indigo-600');
            finalTotal += dPrice;
            summaryLines.innerHTML = `
                <div class="flex justify-between text-sm">
                    <span class="text-slate-500 font-medium">Subtotal</span>
                    <span class="text-slate-800 font-bold">${currency}${total.toFixed(2)}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-slate-500 font-medium">Costo de Envío</span>
                    <span class="text-indigo-600 font-bold">+ ${currency}${dPrice.toFixed(2)}</span>
                </div>
            `;
        } else {
            btnP.classList.add('!bg-indigo-600', '!text-white', '!border-indigo-600');
            btnD.classList.remove('!bg-indigo-600', '!text-white', '!border-indigo-600');
            summaryLines.innerHTML = `
                <div class="flex justify-between text-sm">
                    <span class="text-slate-500 font-medium">Subtotal</span>
                    <span class="text-slate-800 font-bold">${currency}${total.toFixed(2)}</span>
                </div>
                <div class="flex justify-between text-sm">
                    <span class="text-slate-500 font-medium">Método</span>
                    <span class="text-emerald-500 font-bold">Recojo en Local</span>
                </div>
            `;
        }
    } else {
        deliveryUI.classList.add('hidden');
        summaryLines.innerHTML = '';
    }

    document.getElementById('cart-total').innerText = currency + finalTotal.toFixed(2);
}

function changeQty(id, delta) {
    const item = appState.cart.find(c => c.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
        removeFromCart(id);
    } else {
        updateCartBadge();
        renderCartContent();
    }
}

function removeFromCart(id) {
    appState.cart = appState.cart.filter(c => c.id !== id);
    updateCartBadge();
    renderCartContent();
}

function setDeliveryOption(opt) {
    appState.deliveryOption = opt;
    updateTotals();
}

async function handleCheckout(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');

    const customerName = document.getElementById('cust-name').value.trim();
    const customerWhatsapp = document.getElementById('cust-whatsapp').value.trim();
    const customerAddress = document.getElementById('cust-address').value.trim();

    setLoading(btn, true);
    try {
        if (!appState.tenant || !appState.tenant.id) throw new Error('Tienda no definida.');
        if (appState.cart.length === 0) throw new Error('El carrito está vacío.');

        const businessPhone = (appState.tenant.whatsapp_phone || '').replace(/\D/g, '');
        if (!businessPhone) throw new Error('Esta tienda no tiene WhatsApp configurado.');

        const deliverySelected = appState.deliveryOption === 'delivery';
        const itemsForRpc = appState.cart.map(i => ({ id: i.id, qty: i.qty }));

        const { error } = await supabase.rpc('create_order', {
            _store_id:      appState.tenant.id,
            _customer_name: customerName,
            _whatsapp:      customerWhatsapp,
            _items:         itemsForRpc
        });

        if (error) throw error;

        const subtotal = appState.cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
        const deliveryFee = deliverySelected ? parseFloat(appState.tenant.delivery_price || 0) : 0;
        const total = subtotal + deliveryFee;

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
            `*Total:* ${getCurrencySymbol(appState.tenant.currency)}${total.toFixed(2)}`,
            `--------------------------------`,
            `_Enviado desde ClickStore_`
        ].filter(Boolean).join('%0A');

        window.open(`https://wa.me/${businessPhone}?text=${message}`, '_blank');

        showToast('¡Pedido enviado!');
        appState.cart = [];
        updateCartBadge();
        closeDrawer('drawer-cart');
        e.target.reset();
    } catch (err) {
        alert('Error: ' + err.message);
    } finally {
        setLoading(btn, false);
    }
}

// ======================= GEOLOCATION =======================
function getCurrentLocation() {
    if (!navigator.geolocation) {
        showToast('❌ Geolocalización no soportada', 'error');
        return;
    }

    const btn = document.querySelector('button[onclick="getCurrentLocation()"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<span class="spinner-sm"></span> Obteniendo...`;
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude } = position.coords;
            const addressInput = document.getElementById('cust-address');
            const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
            
            // Append or set location
            const locText = `📍 Ubicación: ${mapUrl}`;
            if (addressInput.value.includes('📍 Ubicación:')) {
                addressInput.value = addressInput.value.replace(/📍 Ubicación: https:\/\/www\.google\.com\/maps\?q=[-0-9.,]+/g, locText);
            } else {
                addressInput.value += (addressInput.value ? '\n' : '') + locText;
            }
            
            showToast('✅ Ubicación obtenida');
            btn.innerHTML = originalText;
            btn.disabled = false;
        },
        (error) => {
            console.error("Geo error:", error);
            showToast('❌ No se pudo obtener la ubicación', 'error');
            btn.innerHTML = originalText;
            btn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// Initializer context check for storefront
document.addEventListener('DOMContentLoaded', () => {
    // Add any necessary event listeners for search if needed outside rendering
});

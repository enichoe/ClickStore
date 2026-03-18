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
        appState.paymentMethod = 'cash'; // Default
        
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

function shareStore() {
    const url = window.location.href;
    const title = appState.tenant?.name || 'StoreClick Store';
    const text = `¡Mira esta tienda increíble en StoreClick! 🛍️`;

    if (navigator.share) {
        navigator.share({
            title: title,
            text: text,
            url: url,
        }).catch(err => console.error('Error sharing:', err));
    } else {
        // Fallback a copiar link
        const tempInput = document.createElement("input");
        tempInput.value = url;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        showToast("✅ Enlace de tienda copiado al portapapeles");
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

    // 2. Redes Sociales
    const socialDiv = document.getElementById('store-social-links');
    if (socialDiv) {
        socialDiv.innerHTML = '';
        const links = [
            { id: 'facebook_url', icon: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' },
            { id: 'instagram_url', icon: '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect width="16" height="16" x="4" y="4" rx="4"/><circle cx="12" cy="12" r="3"/><path d="M16.5 7.5v.01"/></svg>' },
            { id: 'tiktok_url', icon: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.1-3.44-3.37-3.5-5.75-.12-2.13.86-4.23 2.49-5.59 1.49-1.28 3.4-1.91 5.35-1.65v4.26c-.99-.25-2.09.08-2.81.84-.54.53-.83 1.29-.81 2.04.01.76.35 1.51.94 2.01.61.48 1.41.67 2.17.51.98-.16 1.83-.93 2.03-1.91.07-.36.07-.74.07-1.11V0z"/></svg>' },
            { id: 'whatsapp_url', icon: '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 21l1.65-3.8a9 9 0 113.4 2.9L3 21z"/><path d="M9 10a.5.5 0 001 0V9a.5.5 0 00-1 0v1zm0 0l1 1m3.5-.5a.5.5 0 00-1 0v1a.5.5 0 001 0v-1zm0 0l-1 1"/></svg>' }
        ];

        links.forEach(link => {
            const url = appState.tenant[link.id];
            if (url) {
                const a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                a.className = 'text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 p-2 rounded-xl border border-slate-100';
                a.innerHTML = link.icon;
                socialDiv.appendChild(a);
            }
        });
    }

    // 3. Categorías
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
    
    // Lista de iconos para rotar
    const icons = ['✨', '📦', '🔥', '💎', '🌈', '🍀', '🍎', '👕', '🍔', '📱'];

    // Contar productos por categoría
    const counts = {};
    appState.products.forEach(p => {
        if (p.active !== false) {
            counts[p.category_id] = (counts[p.category_id] || 0) + 1;
        }
    });
    const totalCount = appState.products.filter(p => p.active !== false).length;

    const allBtn = `
        <button class="cat-btn ${appState.selectedCategory === 'all' ? 'active' : ''}" onclick="filterByCategory('all')">
            <span class="text-lg">🎯</span>
            Todos
            <span class="ml-1 opacity-50 px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] text-slate-800 font-bold">${totalCount}</span>
        </button>`;
        
    const catBtns = appState.categories.map((c, idx) => {
        const count = counts[c.id] || 0;
        return `
            <button class="cat-btn ${appState.selectedCategory === c.id ? 'active' : ''}" onclick="filterByCategory('${c.id}')">
                <span class="text-lg">${icons[idx % icons.length]}</span>
                ${c.name}
                <span class="ml-1 opacity-50 px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] text-slate-800 font-bold">${count}</span>
            </button>
        `;
    }).join('');

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
                    <img src="${p.image_url || 'https://via.placeholder.com/400'}" alt="${p.name}">
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
            <div class="flex gap-4 group p-4 bg-white rounded-3xl border border-slate-50 shadow-sm mb-4">
                <div class="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 flex-shrink-0 border border-slate-100 shadow-inner">
                    <img src="${i.image_url || 'https://via.placeholder.com/100'}" class="w-full h-full object-cover">
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start mb-1">
                        <p class="font-bold text-slate-800 truncate">${i.name}</p>
                        <button type="button" class="text-slate-300 hover:text-red-500 transition-colors p-1" onclick="removeFromCart('${i.id}')">
                            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                    <div class="flex items-center gap-2 mb-3">
                        <span class="text-xs font-bold text-slate-400">${i.qty} x ${currency}${i.price.toFixed(2)}</span>
                        <span class="text-sm font-black text-indigo-600">Total: ${currency}${(i.price * i.qty).toFixed(2)}</span>
                    </div>
                    <div class="qty-control !bg-slate-50">
                        <button type="button" class="qty-btn" onclick="changeQty('${i.id}', -1)">-</button>
                        <span class="text-xs font-bold w-6 text-center text-slate-800">${i.qty}</span>
                        <button type="button" class="qty-btn" onclick="changeQty('${i.id}', 1)">+</button>
                    </div>
                </div>
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
    appState.cart = appState.cart.filter(i => i.id !== id);
    updateCartBadge();
    renderCartContent();
}

function clearCart() {
    if (appState.cart.length === 0) return;
    // Usar modal de confirmación personalizado en el futuro, por ahora confirm es aceptable pero alert no.
    if (confirm('¿Estás seguro de que quieres vaciar el carrito?')) {
        appState.cart = [];
        updateCartBadge();
        renderCartContent();
        showToast('🗑️ Carrito vaciado', 'success');
    }
}

function setDeliveryOption(opt) {
    appState.deliveryOption = opt;
    updateTotals();
}

function setPaymentMethod(method) {
    appState.paymentMethod = method;
    
    // UI Update
    document.querySelectorAll('.payment-method-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`pay-${method}`).classList.add('active');

    const digitalInfo = document.getElementById('payment-digital-info');
    const methodName = document.getElementById('payment-method-name');
    
    if (method === 'cash') {
        digitalInfo.classList.add('hidden');
    } else {
        digitalInfo.classList.remove('hidden');
        methodName.innerText = `Paga con ${method.toUpperCase()}`;
        
        // Cargar QR y número
        const qrUrl = appState.tenant[`${method}_qr_url`];
        const qrImg = document.getElementById('pay-qr-img');
        const qrPlc = document.getElementById('pay-qr-placeholder');
        
        if (qrUrl && qrImg) {
            qrImg.src = qrUrl;
            qrImg.classList.remove('hidden');
            if (qrPlc) qrPlc.classList.add('hidden');
        } else {
            if (qrImg) qrImg.classList.add('hidden');
            if (qrPlc) qrPlc.classList.remove('hidden');
        }

        document.getElementById('pay-phone-label').innerText = appState.tenant.whatsapp_phone || 'Pendiente Configurar';
    }
}

function copyPaymentNumber() {
    const num = document.getElementById('pay-phone-label').innerText;
    navigator.clipboard.writeText(num);
    showToast('✅ Número copiado');
}

function previewVoucher(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = document.getElementById('voucher-img-preview');
        img.src = e.target.result;
        img.classList.remove('hidden');
        document.getElementById('voucher-placeholder').classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

async function handleCheckout(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-order');
    const customerName = document.getElementById('cust-name').value.trim();
    const customerWhatsapp = document.getElementById('cust-whatsapp').value.trim();
    const customerAddress = document.getElementById('cust-address').value.trim();
    const businessPhone = (appState.tenant.whatsapp_phone || '').replace(/\D/g, '');

    if (!customerName || !customerWhatsapp) {
        showToast('❌ Completa tus datos', 'error');
        return;
    }

    setLoading(btn, true);
    try {
        const deliverySelected = appState.deliveryOption === 'delivery';
        const subtotal = appState.cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
        const deliveryFee = deliverySelected ? parseFloat(appState.tenant.delivery_price || 0) : 0;
        const total = subtotal + deliveryFee;

        // Subida de Voucher si aplica
        let voucherUrl = null;
        const voucherFile = document.getElementById('pay-voucher-file')?.files[0];
        if (voucherFile && appState.paymentMethod !== 'cash') {
            const fileName = `vouchers/${appState.tenant.id}/${Date.now()}_${voucherFile.name}`;
            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(fileName, voucherFile);
            
            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);
                voucherUrl = publicUrl;
            } else {
                console.warn('Voucher upload failed:', uploadError.message);
                // Si falla la subida del voucher, intentamos seguir igual pero avisamos
                showToast('⚠️ No se pudo subir la foto del comprobante, pero enviaremos el pedido.', 'warning');
            }
        }

        // Crear pedido en DB
        const itemsForRpc = appState.cart.map(i => ({ id: i.id, qty: i.qty, name: i.name, price: i.price }));
        const { data: orderData, error } = await supabase.from('orders').insert([{
            store_id: appState.tenant.id,
            customer_name: customerName,
            whatsapp_phone: customerWhatsapp,
            items: JSON.stringify(itemsForRpc),
            total: total,
            status: 'pending',
            delivery_address: customerAddress || null,
            delivery_selected: deliverySelected,
            payment_method: appState.paymentMethod,
            voucher_url: voucherUrl
        }]).select().single();

        if (error) throw error;

        // RECONSTRUCCIÓN DEL MENSAJE DE WHATSAPP (FIX CRÍTICO)
        const currency = getCurrencySymbol(appState.tenant.currency);
        const deliveryText = deliverySelected ? `🛵 Delivery` : `🥡 Recojo en local`;
        const paymentText = appState.paymentMethod === 'cash' ? '💵 Efectivo (Contraentrega)' : `📱 ${appState.paymentMethod.toUpperCase()}`;

        let message = `🛍️ *NUEVO PEDIDO EN ${appState.tenant.name.toUpperCase()}*%0A`;
        message += `━━━━━━━━━━━━━━━━━━%0A`;
        message += `👤 *CLIENTE:* ${customerName}%0A`;
        message += `📱 *WSP:* ${customerWhatsapp}%0A`;
        message += `🚚 *ENTREGA:* ${deliveryText}%0A`;
        if (customerAddress) message += `📍 *DIRECCIÓN:* ${customerAddress}%0A`;
        message += `💳 *PAGO:* ${paymentText}%0A`;
        message += `━━━━━━━━━━━━━━━━━━%0A`;
        message += `📦 *PRODUCTOS:*%0A`;

        appState.cart.forEach(i => {
            message += `• ${i.qty}x ${i.name} (${currency}${i.price.toFixed(2)})%0A`;
        });

        message += `━━━━━━━━━━━━━━━━━━%0A`;
        message += `💵 *SUBTOTAL:* ${currency}${subtotal.toFixed(2)}%0A`;
        if (deliveryFee > 0) message += `🚚 *ENVÍO:* ${currency}${deliveryFee.toFixed(2)}%0A`;
        message += `💰 *TOTAL A PAGAR: ${currency}${total.toFixed(2)}*%0A`;
        message += `━━━━━━━━━━━━━━━━━━%0A`;
        
        if (voucherUrl) {
            message += `🖼️ *COMPROBANTE:* ${voucherUrl}%0A`;
        } else if (appState.paymentMethod !== 'cash') {
            message += `⚠️ _Pendiente enviar captura de pago_%0A`;
        }

        message += `📲 _Pedido #${orderData.id.split('-')[0].toUpperCase()}_%0A`;
        message += `🛒 _Creado en StoreClick.pe_`;

        // Abrir WhatsApp
        window.open(`https://wa.me/${businessPhone}?text=${message}`, '_blank');

        showToast('✅ ¡Pedido enviado con éxito!');
        appState.cart = [];
        updateCartBadge();
        closeDrawer('drawer-cart');
        e.target.reset();

    } catch (err) {
        showToast('❌ Error: ' + err.message, 'error');
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

// ======================= ADMIN LOGIC =======================
async function initializeAdminUI() {
    if (!appState.tenant) return;
    
    // Update basic text
    const storeName = appState.tenant.name;
    const headerName = document.getElementById('admin-store-name');
    const mobileHeaderName = document.getElementById('mobile-store-name');
    
    if (headerName) headerName.innerText = storeName;
    if (mobileHeaderName) mobileHeaderName.innerText = storeName;
    
    // Load all settings into inputs & sync preview
    loadStoreSettingsForm();

    const storeIdentifier = appState.tenant.slug || appState.tenant.id;
    const linkInput = document.getElementById('store-link-input');
    if (linkInput) {
        linkInput.value = window.location.origin + window.location.pathname + '?store=' + storeIdentifier;
    }
    
    await Promise.all([
        updateUsageStats(),
        fetchProducts(),
        fetchCategories(),
        fetchOrders()
    ]);

    checkSuperAdmin();
}

function copyStoreLink() {
    const input = document.getElementById('store-link-input');
    if (!input) return;
    input.select();
    document.execCommand('copy');
    showToast('¡Enlace copiado al portapapeles!');
}

async function updateUsageStats() {
    if (!appState.tenant) return;
    
    try {
        const { data: prods } = await supabase.from('products').select('id', { count: 'exact' }).eq('store_id', appState.tenant.id);
        
        const count = prods?.length || 0;
        const max = appState.tenant.plan === 'pro' ? 999 : (appState.tenant.plan === 'base' ? 100 : 10);
        
        // Update UI
        const usageCountEl = document.getElementById('usage-count');
        const usageMaxEl = document.getElementById('usage-max');
        const usageFillEl = document.getElementById('usage-bar-fill');
        const planNameEl = document.getElementById('current-plan-name');

        if (usageCountEl) usageCountEl.innerText = count;
        if (usageMaxEl) usageMaxEl.innerText = max;
        if (usageFillEl) usageFillEl.style.width = `${Math.min((count / max) * 100, 100)}%`;
        if (planNameEl) planNameEl.innerText = (appState.tenant.plan || 'Gratis').toUpperCase();

    } catch (err) {
        console.error("Error stats usage:", err);
    }
}

async function checkSuperAdmin() {
    try {
        const { data, error } = await supabase
            .from('platform_admins')
            .select('*')
            .eq('user_id', appState.session.user.id)
            .maybeSingle();
        
        if (data) {
            const sidebar = document.querySelector('#admin-sidebar nav');
            if (sidebar && !document.getElementById('nav-super')) {
                const superItem = document.createElement('div');
                superItem.id = 'nav-super';
                superItem.className = 'nav-item';
                superItem.style.background = 'rgba(37,99,235,0.1)';
                superItem.style.color = 'var(--accent)';
                superItem.style.fontWeight = '800';
                superItem.innerHTML = '🛡️ SUPER ADMIN';
                superItem.onclick = () => showView('view-superadmin');
                sidebar.prepend(superItem);
            }
        }
    } catch (err) {
        console.warn("Error checking super admin:", err);
    }
}

async function fetchProducts() {
    try {
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .eq('store_id', appState.tenant.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('fetchProducts error:', error);
            appState.products = [];
            renderProducts();
            return;
        }

        appState.products = data || [];
        renderProducts();
        
        // Actualizar select de categorías en el modal
        const catSelect = document.getElementById('p-category');
        if (catSelect) {
            catSelect.innerHTML = '<option value="">Sin Categoría</option>' + (appState.categories || []).map(c => `
                <option value="${c.id}">${c.name}</option>
            `).join('');
        }
    } catch (err) {
        console.error('Unexpected fetchProducts error:', err);
        appState.products = [];
        renderProducts();
    }
}

async function fetchCategories() {
    try {
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .eq('store_id', appState.tenant.id)
            .order('name', { ascending: true });

        if (error) throw error;
        appState.categories = data || [];
        renderCategories();
    } catch (err) {
        console.error('fetchCategories error:', err);
    }
}

function renderCategories() {
    const list = document.getElementById('list-categories');
    
    // Sincronizar select de producto también
    const catSelect = document.getElementById('p-category');
    if (catSelect) {
        catSelect.innerHTML = '<option value="">Sin Categoría</option>' + (appState.categories || []).map(c => `
            <option value="${c.id}">${c.name}</option>
        `).join('');
    }

    if (!list) return;
    
    if (appState.categories.length === 0) {
        list.innerHTML = '<div class="card">No hay categorías.</div>';
        return;
    }

    list.innerHTML = appState.categories.map(c => `
        <div class="card" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; margin-bottom: 8px;">
            <span style="font-weight: 600;">${c.name}</span>
            <button class="btn btn-danger btn-sm" onclick="deleteCategory('${c.id}')">Eliminar</button>
        </div>
    `).join('');
}

async function saveCategory(e) {
    if (e) e.preventDefault();
    const nameInput = document.getElementById('cat-name');
    const name = nameInput.value.trim();
    if (!name) return;

    try {
        const { error } = await supabase
            .from('categories')
            .insert([{ name, store_id: appState.tenant.id }]);

        if (error) throw error;
        nameInput.value = '';
        closeModal('modal-category');
        showToast('Categoría creada');
        fetchCategories();
    } catch (err) {
        showToast('❌ Error: ' + err.message, 'error');
    }
}

async function deleteCategory(id) {
    if (!confirm('¿Eliminar esta categoría? Los productos ya no estarán vinculados a ella.')) return;
    try {
        const { error } = await supabase.from('categories').delete().eq('id', id);
        if (error) throw error;
        showToast('Categoría eliminada');
        fetchCategories();
    } catch (err) {
        showToast('❌ Error: ' + err.message, 'error');
    }
}

function renderProducts() {
    const grid = document.getElementById('grid-products');
    if (!grid) return;
    grid.innerHTML = '';

    appState.products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card group';
        card.innerHTML = `
            <div class="product-image-container relative">
                <img src="${p.image || 'https://via.placeholder.com/300'}" alt="${p.name}" loading="lazy">
                <div class="absolute top-3 right-3 flex gap-2">
                    <button class="w-8 h-8 rounded-full bg-white/90 text-indigo-600 flex items-center justify-center shadow-lg hover:bg-white active:scale-95 transition-all" onclick="openEditProduct('${p.id}')">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                    </button>
                    <button class="w-8 h-8 rounded-full bg-white/90 text-red-600 flex items-center justify-center shadow-lg hover:bg-white active:scale-95 transition-all" onclick="deleteProduct('${p.id}')">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
                ${!p.active ? '<span class="absolute top-3 left-3 px-2 py-1 bg-red-500 text-white text-[8px] font-black uppercase rounded-md shadow-lg">Inactivo</span>' : ''}
            </div>
            <div class="p-4 bg-slate-900">
                <div class="flex justify-between items-start mb-1">
                    <h4 class="text-sm font-black text-white truncate pr-2">${p.name}</h4>
                    <span class="text-sm font-black text-indigo-400">S/${parseFloat(p.price).toFixed(2)}</span>
                </div>
                <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">${p.category_id || 'Sin Categoría'}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Abre el modal para CREAR un producto nuevo (limpia el estado anterior)
function openNewProductModal() {
    editingProductId = null;
    const form = document.getElementById('form-product');
    if (form) form.reset();
    
    document.getElementById('modal-product-title').innerText = 'Agregar Producto';
    
    // Reset simulator preview
    const simImg = document.getElementById('sim-p-image');
    const simPlc = document.getElementById('sim-p-placeholder');
    if (simImg) { simImg.src = ''; simImg.classList.add('hidden'); }
    if (simPlc) { simPlc.classList.remove('hidden'); }

    openModal('modal-product');
    syncProductPreview();
}

function openEditProduct(id) {
    const p = appState.products.find(item => item.id === id);
    if (!p) return;

    editingProductId = id;
    document.getElementById('modal-product-title').innerText = 'Editar Producto';
    
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-price').value = p.price;
    document.getElementById('p-description').value = p.description || '';
    document.getElementById('p-category').value = p.category_id || '';
    document.getElementById('p-active').checked = p.active;

    // Reset image input
    document.getElementById('p-image-file').value = '';

    // Modal Image Preview
    const imgPreview = document.getElementById('image-preview');
    const uploadPrompt = document.getElementById('image-upload-prompt');
    if (p.image && imgPreview) {
        imgPreview.src = p.image;
        imgPreview.classList.remove('hidden');
        if (uploadPrompt) uploadPrompt.classList.add('hidden');
    } else {
        if (imgPreview) imgPreview.classList.add('hidden');
        if (uploadPrompt) uploadPrompt.classList.remove('hidden');
    }

    // Simulator Preview
    const simImg = document.getElementById('sim-p-image');
    const simPlc = document.getElementById('sim-p-placeholder') || document.getElementById('sim-p-image-placeholder');
    if (p.image && simImg) {
        simImg.src = p.image;
        simImg.classList.remove('hidden');
        if (simPlc) simPlc.classList.add('hidden');
    } else {
        if (simImg) simImg.classList.add('hidden');
        if (simPlc) simPlc.classList.remove('hidden');
    }

    openModal('modal-product');
    syncProductPreview();
}

function syncProductPreview() {
    const name = document.getElementById('p-name').value || 'Nombre del Producto';
    const price = document.getElementById('p-price').value || '0.00';
    const desc = document.getElementById('p-description').value || 'Aquí aparecerá la descripción...';
    
    const simName = document.getElementById('sim-p-name');
    const simPrice = document.getElementById('sim-p-price');
    const simDesc = document.getElementById('sim-p-desc');
    
    if (simName) simName.innerText = name;
    if (simPrice) simPrice.innerText = `S/ ${parseFloat(price || 0).toFixed(2)}`;
    if (simDesc) simDesc.innerText = desc;
}

function previewImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        // Modal Preview
        const imgPre = document.getElementById('image-preview');
        const uploadPr = document.getElementById('image-upload-prompt');
        if (imgPre) {
            imgPre.src = e.target.result;
            imgPre.classList.remove('hidden');
            if (uploadPr) uploadPr.classList.add('hidden');
        }

        // Simulator Preview
        const simImg = document.getElementById('sim-p-image');
        const simPlc = document.getElementById('sim-p-placeholder') || document.getElementById('sim-p-image-placeholder');
        if (simImg) {
            simImg.src = e.target.result;
            simImg.classList.remove('hidden');
            if (simPlc) simPlc.classList.add('hidden');
        }
    };
    reader.readAsDataURL(file);
}

function previewQR(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById(`setting-qr-${type}-preview`);
        const placeholder = document.getElementById(`setting-qr-${type}-placeholder`);
        if (preview) {
            preview.src = e.target.result;
            preview.classList.remove('hidden');
            if (placeholder) placeholder.classList.add('hidden');
        }
    };
    reader.readAsDataURL(file);
}
async function fetchOrders() {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('*')
            .eq('store_id', appState.tenant.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('fetchOrders error:', error);
            appState.orders = [];
            renderOrders();
            return;
        }

        appState.orders = data || [];
        renderOrders();
    } catch (err) {
        console.error('Unexpected fetchOrders error:', err);
        appState.orders = [];
        renderOrders();
    }
}

function renderOrders() {
    const list = document.getElementById('list-orders');
    const dashList = document.getElementById('dash-recent-orders');
    if (!list || !dashList) return;
    
    // 1. Calcular Estadísticas
    let totalSales = 0;
    let digitalSales = 0;
    let cashSales = 0;
    let digitalCount = 0;
    let cashCount = 0;
    let pendingCount = 0;

    appState.orders.forEach(o => {
        const amount = parseFloat(o.total || 0);
        totalSales += amount;
        
        if (o.status === 'pending') pendingCount++;

        // Diferenciar por método de pago
        // (cash vs yape/plin/etc)
        if (o.payment_method === 'cash') {
            cashSales += amount;
            cashCount++;
        } else {
            digitalSales += amount;
            digitalCount++;
        }
    });

    const currency = getCurrencySymbol(appState.tenant.currency);

    // 2. Actualizar Tarjetas del Dashboard
    const elSales = document.getElementById('stat-sales');
    const elDigital = document.getElementById('stat-sales-digital');
    const elCash = document.getElementById('stat-sales-cash');
    const elCountDigital = document.getElementById('stat-count-digital');
    const elCountCash = document.getElementById('stat-count-cash');
    const elOrders = document.getElementById('stat-orders');

    if (elSales) elSales.innerText = `${currency}${totalSales.toFixed(2)}`;
    if (elDigital) elDigital.innerText = `${currency}${digitalSales.toFixed(2)}`;
    if (elCash) elCash.innerText = `${currency}${cashSales.toFixed(2)}`;
    if (elCountDigital) elCountDigital.innerText = `${digitalCount} Pedidos`;
    if (elCountCash) elCountCash.innerText = `${cashCount} Pedidos`;
    if (elOrders) elOrders.innerText = appState.orders.length;
    
    // 3. Badge de notificación
    const badge = document.getElementById('order-badge');
    if (badge) {
        if (pendingCount > 0) {
            badge.style.display = 'block';
            badge.innerText = pendingCount;
        } else {
            badge.style.display = 'none';
        }
    }

    if (appState.orders.length === 0) {
        list.innerHTML = '<div class="card text-center py-10 text-slate-500">No hay pedidos aún.</div>';
        dashList.innerHTML = '<p class="text-slate-500 italic text-center py-6">No hay pedidos recientes.</p>';
        return;
    }

    // 4. Renderizar Lista
    const html = appState.orders.map(o => {
        let itemsCount = 0;
        try {
            const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
            itemsCount = Array.isArray(items) ? items.reduce((sum, i) => sum + (i.qty || 1), 0) : 0;
        } catch (e) {
            console.error("Error parsing items for order:", o.id, e);
        }

        const date = new Date(o.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

        return `
            <div class="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex flex-col md:flex-row justify-between md:items-center group hover:border-slate-700 transition-all gap-4">
                <div class="flex items-center gap-4 w-full md:w-auto">
                    <div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold shrink-0">
                        ${o.customer_name ? o.customer_name[0].toUpperCase() : '?'}
                    </div>
                    <div>
                        <p class="font-bold text-white">${o.customer_name || 'Cliente'}</p>
                        <p class="text-[11px] text-slate-500 uppercase tracking-wider">${date} • ${itemsCount} items</p>
                    </div>
                </div>
                <div class="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end border-t border-slate-800 pt-3 md:border-t-0 md:pt-0">
                    <div class="text-left md:text-right flex flex-col items-start md:items-end w-full max-w-[120px]">
                        <p class="font-bold text-white mb-1">${currency}${parseFloat(o.total || 0).toFixed(2)}</p>
                        <select class="input !py-1 !px-2 !text-[10px] font-bold uppercase tracking-wider !bg-slate-800 !border-slate-700 !rounded !text-slate-300 w-full" onchange="updateOrderStatus('${o.id}', this.value)">
                            <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pendiente</option>
                            <option value="attended" ${o.status === 'attended' ? 'selected' : ''}>Atendido</option>
                            <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Entregado</option>
                        </select>
                    </div>
                    <button class="btn btn-secondary btn-sm whitespace-nowrap" onclick="viewOrderDetails('${o.id}')">Ver Detalle</button>
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = `<div class="space-y-4 p-4">${html}</div>`;
    dashList.innerHTML = html;
}

let currentViewOrderId = null;

function viewOrderDetails(id) {
    const o = appState.orders.find(ord => ord.id === id);
    if (!o) return;
    currentViewOrderId = id;
    
    document.getElementById('mo-customer').innerText = o.customer_name;
    document.getElementById('mo-whatsapp').innerText = o.whatsapp || 'No proporcionado';
    document.getElementById('mo-address').innerText = o.delivery_address || 'No proporcionado'; // address is not in DB originally, keep as fallback
    
    // Add date
    const date = new Date(o.created_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    document.getElementById('mo-date').innerText = date;
    
    const statusSelect = document.getElementById('mo-status');
    if (statusSelect) {
        statusSelect.value = (o.status === 'processing') ? 'attended' : (o.status === 'completed' ? 'delivered' : o.status);
    }

    const itemsDiv = document.getElementById('mo-items');
    try {
        const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
        const currencySymbol = getCurrencySymbol(appState.tenant.currency);
        
        itemsDiv.innerHTML = items.map(i => {
            const product = appState.products.find(p => p.id === i.id) || {};
            const name = product.name || 'Producto Desconocido';
            const price = product.price || 0;
            const img = product.image || '';
            
            return `
                <div class="flex justify-between items-center bg-slate-900 border border-slate-700 p-3 rounded-lg">
                    <div class="flex gap-3 items-center">
                        <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                            ${img ? `<img src="${img}" class="w-full h-full object-cover">` : `<span class="text-xs">🛒</span>`}
                        </div>
                        <div>
                            <p class="font-bold text-white text-sm">${name}</p>
                            <p class="text-xs text-slate-400">${i.qty} x ${currencySymbol}${parseFloat(price).toFixed(2)}</p>
                        </div>
                    </div>
                    <div class="font-bold text-slate-200">
                        ${currencySymbol}${(i.qty * parseFloat(price)).toFixed(2)}
                    </div>
                </div>
            `;
        }).join('');
    } catch(e) {
        itemsDiv.innerHTML = '<p class="text-slate-500 text-sm">Error cargando productos.</p>';
    }

    const currencySymbol = getCurrencySymbol(appState.tenant.currency);
    document.getElementById('mo-total').innerText = currencySymbol + parseFloat(o.total || 0).toFixed(2);
    
    openModal('modal-order-details');
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
        if (error) throw error;
        
        const order = appState.orders.find(o => o.id === orderId);
        if (order) order.status = newStatus;
        
        // Sync modal status if open
        if (currentViewOrderId === orderId) {
            const ms = document.getElementById('mo-status');
            if (ms) ms.value = newStatus;
        }
        
        showToast('✅ Estado actualizado');
        renderOrders();
    } catch (err) {
        showToast('❌ Error al actualizar estado: ' + err.message);
    }
}

function updateOrderStatusFromModal(newStatus) {
    if (currentViewOrderId) {
        updateOrderStatus(currentViewOrderId, newStatus);
    }
}

async function saveProduct(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    
    // Check plan limits
    if (!editingProductId && appState.usage) {
        if (appState.usage.product_count >= appState.usage.max_products) {
            showToast(`⚠️ Límite alcanzado (${appState.usage.max_products} productos). Actualiza tu plan.`, 'error');
            return;
        }
    }

    const fileInput = document.getElementById('p-image-file');
    const file = fileInput.files?.[0];
    let imageUrl = 'https://via.placeholder.com/300';

    setLoading(btn, true);
    try {
        if (!appState.tenant || !appState.tenant.id) {
            throw new Error('No hay tienda definida. Refresca e intenta de nuevo.');
        }
        if (file) {
            // Comprimir imagen antes de subir (Max 1000px, 80% calidad)
            const compressedFile = await compressImage(file, 1000, 1000, 0.8);
            
            const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(fileName, compressedFile);
            if (uploadError) {
                console.warn('Upload error:', uploadError);
                throw uploadError;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(fileName);

            imageUrl = publicUrl;
        } else if (editingProductId) {
             // Mantener imagen anterior si estamos editando y no subimos nueva
             const oldProd = appState.products.find(p => p.id === editingProductId);
             if (oldProd) imageUrl = oldProd.image;
        }

        const product = {
            store_id: appState.tenant.id,
            name: document.getElementById('p-name').value,
            price: Number(parseFloat(document.getElementById('p-price').value) || 0),
            category_id: document.getElementById('p-category').value || null,
            description: document.getElementById('p-description').value,
            active: document.getElementById('p-active').checked,
            image: imageUrl
        };

        // Validaciones básicas
        if (!product.name) throw new Error('El producto requiere un nombre.');
        if (isNaN(product.price) || product.price < 0) throw new Error('Precio inválido.');

        if (editingProductId) {
            const { error } = await supabase.from('products').update(product).eq('id', editingProductId);
            if (error) throw error;
            editingProductId = null;
        } else {
            const { error } = await supabase.from('products').insert([product]);
            if (error) throw error;
        }
        
        await fetchProducts();
        if (typeof closeModal === 'function') closeModal('modal-product');
        e.target.reset();
        document.getElementById('modal-product-title').innerText = "Agregar Producto";
    } catch (err) {
        showToast("❌ Error: " + err.message, 'error');
    } finally {
        setLoading(btn, false);
    }
}

async function deleteProduct(id) {
    if (!confirm("¿Eliminar este producto?")) return;
    try {
        if (!appState.tenant || !appState.tenant.id) throw new Error('No hay tienda definida.');
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
        await fetchProducts();
    } catch (err) {
        showToast("❌ Error: " + err.message, 'error');
    }
}

// Function to load store settings into the form
function loadStoreSettingsForm() {
    const s = appState.tenant;
    if (!s) return;

    document.getElementById('setting-name').value = s.name || '';
    document.getElementById('setting-slug').value = s.slug || '';
    document.getElementById('setting-whatsapp').value = s.whatsapp_phone || '';
    document.getElementById('setting-currency').value = s.currency || 'PEN';
    
    const deliveryCheck = document.getElementById('setting-delivery-active');
    const deliveryPriceInput = document.getElementById('setting-delivery-price');
    
    if (deliveryCheck) {
        deliveryCheck.checked = s.active_delivery === true;
        toggleDeliveryPriceUI();
    }
    if (deliveryPriceInput) {
        deliveryPriceInput.value = s.delivery_price || 0;
    }

    // Social media links
    const fbInput = document.getElementById('setting-fb');
    const igInput = document.getElementById('setting-ig');
    const tkInput = document.getElementById('setting-tk');
    const waInput = document.getElementById('setting-wa-url');
    
    if (fbInput) fbInput.value = s.facebook_url || '';
    if (igInput) igInput.value = s.instagram_url || '';
    if (tkInput) tkInput.value = s.tiktok_url || '';
    if (waInput) waInput.value = s.whatsapp_url || '';

    // QR Preview
    const qrs = ['yape', 'plin'];
    qrs.forEach(type => {
        const url = s[`${type}_qr_url`];
        const preview = document.getElementById(`setting-qr-${type}-preview`);
        const placeholder = document.getElementById(`setting-qr-${type}-placeholder`);
        if (url && preview) {
            preview.src = url;
            preview.classList.remove('hidden');
            if (placeholder) placeholder.classList.add('hidden');
        } else if (preview) {
             preview.classList.add('hidden');
             if (placeholder) placeholder.classList.remove('hidden');
        }
    });

    syncStorePreview();
}

function toggleDeliveryPriceUI() {
    const check = document.getElementById('setting-delivery-active');
    const container = document.getElementById('delivery-price-container');
    if (check && container) {
        if (check.checked) {
            container.classList.remove('hidden');
            container.style.display = 'block';
        } else {
            container.classList.add('hidden');
            container.style.display = 'none';
        }
    }
}

function previewLogo(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById('setting-logo-preview');
        const placeholder = document.getElementById('setting-logo-placeholder');
        if (preview) {
            preview.src = e.target.result;
            preview.classList.remove('hidden');
            if (placeholder) placeholder.classList.add('hidden');

            // Update simulator also
            const simLogo = document.getElementById('sim-store-logo');
            const simPlaceholder = document.getElementById('sim-store-logo-placeholder');
            if (simLogo) {
                simLogo.src = e.target.result;
                simLogo.classList.remove('hidden');
                if (simPlaceholder) simPlaceholder.style.display = 'none';
            }
        }
    };
    reader.readAsDataURL(file);
}

function syncStorePreview() {
    const name = document.getElementById('setting-name').value || 'Nombre de tu Tienda';
    const simName = document.getElementById('sim-store-name');
    const simLogo = document.getElementById('sim-store-logo');
    const simPlaceholder = document.getElementById('sim-store-logo-placeholder');

    if (simName) simName.innerText = name;

    // Handle initial load logo
    if (appState.tenant?.logo_url && !document.getElementById('setting-logo-file').files[0]) {
        if (simLogo) {
            simLogo.src = appState.tenant.logo_url;
            simLogo.classList.remove('hidden');
            if (simPlaceholder) simPlaceholder.style.display = 'none';
        }
    }
}

async function updateStoreSettings(event) {
    const btn = event?.target || document.querySelector('button[onclick="updateStoreSettings()"]');
    if (btn) btn.disabled = true;

    try {
        const nameInput = document.getElementById('setting-name');
        const slugInput = document.getElementById('setting-slug');
        const whatsappInput = document.getElementById('setting-whatsapp');
        const currencyInput = document.getElementById('setting-currency');
        const deliveryCheck = document.getElementById('setting-delivery-active');
        const deliveryPriceInput = document.getElementById('setting-delivery-price');

        if (!nameInput.value.trim()) throw new Error("El nombre es requerido");

        let logoUrl = appState.tenant.logo_url;
        const logoFile = document.getElementById('setting-logo-file').files[0];

        if (logoFile) {
            // Comprimir logo (Max 512px para identidad visual)
            const compressedLogo = await compressImage(logoFile, 512, 512, 0.8);
            
            const fileName = `${appState.tenant.id}/logo_${Date.now()}.jpg`; // Forzado a JPG por compressImage
            const { error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(fileName, compressedLogo, { upsert: true });

            if (uploadError) {
                if (uploadError.message === 'Bucket not found') {
                    throw new Error('El contenedor de almacenamiento "product-images" no existe en Supabase.');
                }
                throw uploadError;
            }

            const { data: publicData } = supabase.storage
                .from('product-images')
                .getPublicUrl(fileName);
            logoUrl = publicData.publicUrl;
        }

        // Redes Sociales
        const fbInput = document.getElementById('setting-fb');
        const igInput = document.getElementById('setting-ig');
        const tkInput = document.getElementById('setting-tk');
        const waUrlInput = document.getElementById('setting-wa-url');

        // Manejo de QRs de pago
        const updateData = {
            name: nameInput.value.trim(),
            slug: slugInput.value.trim().toLowerCase(),
            whatsapp_phone: whatsappInput.value.trim(),
            currency: currencyInput.value,
            active_delivery: deliveryCheck.checked,
            delivery_price: parseFloat(deliveryPriceInput.value) || 0,
            logo_url: logoUrl,
            facebook_url: fbInput?.value.trim() || null,
            instagram_url: igInput?.value.trim() || null,
            tiktok_url: tkInput?.value.trim() || null,
            whatsapp_url: waUrlInput?.value.trim() || null
        };

        // Subir QRs de pago si hay nuevos archivos
        const qrs = ['yape', 'plin'];
        for (const type of qrs) {
            const qrFile = document.getElementById(`setting-qr-${type}-file`).files[0];
            if (qrFile) {
                const compQR = await compressImage(qrFile, 512, 512, 0.8);
                const qrName = `${appState.tenant.id}/qr_${type}_${Date.now()}.jpg`;
                const { error: qrErr } = await supabase.storage.from('product-images').upload(qrName, compQR, { upsert: true });
                if (!qrErr) {
                    const { data: qp } = supabase.storage.from('product-images').getPublicUrl(qrName);
                    updateData[`${type}_qr_url`] = qp.publicUrl;
                }
            }
        }

        const { data, error } = await supabase
            .from('stores')
            .update(updateData)
            .eq('id', appState.tenant.id)
            .select()
            .single();

        if (error) throw error;
        
        appState.tenant = data;
        showToast('✅ Configuración guardada correctamente');
        loadStoreSettingsForm(); // Refresh UI
        
        // Update header name if it exists
        const headerName = document.getElementById('admin-store-name');
        if (headerName) headerName.innerText = data.name;

    } catch (err) {
        console.error(err);
        showToast('❌ Error: ' + err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function toggleSidebar(force) {
    const sidebar = document.getElementById('admin-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!sidebar) return;
    
    let shouldOpen;
    if (typeof force === 'boolean') {
        shouldOpen = force;
    } else {
        shouldOpen = !sidebar.classList.contains('open');
    }

    if (shouldOpen) {
        sidebar.classList.add('open');
        if (overlay) overlay.classList.add('active');
    } else {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
    }
}

// ======================= SUPER ADMIN ACTIONS =======================
async function fetchGlobalStores() {
    try {
        const { data: stores, error: sErr } = await supabase.from('stores').select('*').order('created_at', { ascending: false });
        if (sErr) throw sErr;

        const { count: totalOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true });

        document.getElementById('super-total-stores').innerText = stores.length;
        document.getElementById('super-total-orders').innerText = totalOrders || 0;

        const list = document.getElementById('super-stores-list');
        list.innerHTML = stores.map(s => {
            const planColor = s.plan === 'pro' ? 'text-indigo-400 bg-indigo-500/10' : (s.plan === 'base' ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-slate-500/10');
            const planName = s.plan === 'pro' ? 'PROFESIONAL' : (s.plan === 'base' ? 'ESCENCIAL' : 'GRATUITO');
            
            return `
            <div data-store-name="${s.name}" data-store-slug="${s.slug}" class="p-6 lg:p-8 border-b border-white/5 flex flex-col lg:flex-row justify-between lg:items-center bg-slate-900/40 hover:bg-slate-800/20 transition-all gap-6 lg:gap-8">
                <div class="flex items-start lg:items-center gap-4 lg:gap-6">
                    <div class="w-12 h-12 lg:w-16 lg:h-16 rounded-xl lg:rounded-2xl bg-slate-800 flex items-center justify-center overflow-hidden border border-white/5 shrink-0">
                        ${s.logo_url ? `<img src="${s.logo_url}" class="w-full h-full object-cover">` : `<span class="text-xl lg:text-2xl">🏬</span>`}
                    </div>
                    <div>
                        <div class="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                            <h4 class="text-lg lg:text-xl font-black text-white truncate max-w-[200px] sm:max-w-none">${s.name}</h4>
                            <span class="inline-flex px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${s.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'} w-fit">
                                ${s.active ? 'ACTIVA' : 'PAUSADA'}
                            </span>
                        </div>
                        <p class="text-xs lg:text-sm text-slate-500 font-medium">
                            <span class="text-indigo-300">/${s.slug || 'sin-slug'}</span> • 
                            <span class="text-slate-400">${s.whatsapp_phone || 'Sin WhatsApp'}</span>
                        </p>
                        <div class="flex gap-2 mt-3">
                            <div class="px-2 lg:px-3 py-1 rounded-lg ${planColor} text-[8px] lg:text-[9px] font-black tracking-widest uppercase">
                                ${planName}
                            </div>
                            <div class="px-2 lg:px-3 py-1 rounded-lg bg-white/5 text-[8px] lg:text-[9px] font-black tracking-widest uppercase text-slate-500">
                                ID: ${s.id.slice(0, 8)}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 sm:flex sm:items-center gap-2 lg:gap-3 w-full lg:w-auto mt-2 lg:mt-0 pt-4 lg:pt-0 border-t lg:border-t-0 border-white/5">
                    <button class="btn btn-secondary !py-2.5 px-4 !text-[11px] !rounded-xl" onclick="toggleStoreActive('${s.id}', ${s.active})">
                        ${s.active ? 'Suspender' : 'Activar'}
                    </button>
                    <button class="btn btn-ghost !py-2.5 px-4 !text-[11px] !rounded-xl text-white bg-white/5 hover:bg-slate-700" onclick="editStoreByAdmin('${s.id}')">
                        Configurar
                    </button>
                    <button class="btn btn-danger !py-2.5 px-4 !text-[11px] !rounded-xl col-span-2 sm:col-auto" onclick="deleteStoreByAdmin('${s.id}')">
                       Eliminar
                    </button>
                </div>
            </div>
        `}).join('');
    } catch (err) {
        showToast("Error cargando dashboard global", "error");
    }
}

function filterGlobalStores(val) {
    const q = val.toLowerCase();
    document.querySelectorAll('#super-stores-list > div').forEach(el => {
        const name = el.dataset.storeName?.toLowerCase() || '';
        const slug = el.dataset.storeSlug?.toLowerCase() || '';
        el.style.display = (name.includes(q) || slug.includes(q)) ? 'flex' : 'none';
    });
}

async function toggleStoreActive(id, currentStatus) {
    try {
        const { error } = await supabase.from('stores').update({ active: !currentStatus }).eq('id', id);
        if (error) throw error;
        showToast("Estado de tienda actualizado");
        fetchGlobalStores();
    } catch (err) {
        showToast("Error al actualizar estado", "error");
    }
}

async function deleteStoreByAdmin(id) {
    if (!confirm("¿ESTÁS SEGURO? Esto borrará la tienda y TODOS sus productos y pedidos permanentemente.")) return;
    try {
        const { error } = await supabase.from('stores').delete().eq('id', id);
        if (error) throw error;
        showToast("✅ Tienda eliminada");
        fetchGlobalStores();
    } catch (err) {
        showToast("❌ Error: " + err.message, 'error');
    }
}

let editingStoreId = null;

function openStoreModal() {
    editingStoreId = null;
    document.getElementById('modal-store-title').innerText = "Crear Nueva Tienda";
    document.getElementById('s-name').value = '';
    document.getElementById('s-slug').value = '';
    document.getElementById('s-type').value = 'Otros';
    document.getElementById('s-plan').value = 'free';
    openModal('modal-store');
}

function editStoreByAdmin(id) {
    const list = document.getElementById('super-stores-list');
    // Como no guardamos las tiendas globales en appState (mala práctica, pero sigamos el patrón actual)
    // Vamos a buscarla en el DOM o mejor, volver a pedirla o pedirla de Supabase
    editingStoreId = id;
    loadStoreToEdit(id);
}

async function loadStoreToEdit(id) {
    try {
        const { data, error } = await supabase.from('stores').select('*').eq('id', id).single();
        if (error) throw error;
        
        document.getElementById('modal-store-title').innerText = "Editar Tienda";
        document.getElementById('s-name').value = data.name;
        document.getElementById('s-slug').value = data.slug || '';
        document.getElementById('s-type').value = data.type;
        document.getElementById('s-plan').value = data.plan || 'free';
        openModal('modal-store');
    } catch (err) {
        showToast("❌ Error cargando datos: " + err.message, 'error');
    }
}

async function saveStoreByAdmin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const store = {
        name: document.getElementById('s-name').value,
        slug: document.getElementById('s-slug').value || null,
        type: document.getElementById('s-type').value,
        plan: document.getElementById('s-plan').value
    };

    setLoading(btn, true);
    try {
        // Validaciones mínimas
        if (!store.name) throw new Error('Nombre de tienda requerido.');
        if (store.slug) {
            // comprobar colisión de slug
            const { data: existing, error: exErr } = await supabase.from('stores').select('id').eq('slug', store.slug).maybeSingle();
            if (exErr) console.warn('Error comprobando slug:', exErr);
            if (existing && (!editingStoreId || existing.id !== editingStoreId)) throw new Error('El slug ya está en uso.');
        }

        if (editingStoreId) {
            console.log("Updating store:", editingStoreId, store);
            const { error } = await supabase.from('stores').update(store).eq('id', editingStoreId);
            if (error) {
                console.error("Supabase Update Error:", error);
                throw error;
            }
            showToast("✅ Tienda actualizada");
        } else {
            // Nota: Al crear por admin no asociamos owner_id real a menos que lo pidas
            store.owner_id = appState.session?.user?.id || null;
            const { error } = await supabase.from('stores').insert([store]);
            if (error) {
                console.error("Supabase Insert Error:", error);
                throw error;
            }
            showToast("✅ Tienda creada con éxito");
        }
        
        closeModal('modal-store');
        fetchGlobalStores();
    } catch (err) {
        console.error("TECHNICAL ERROR:", err);
        // Diagnóstico detallado en pantalla
        const detailMsg = err.details || err.hint || "Possible schema mismatch or missing column.";
        showToast("❌ Error: " + (err.message || "Petición rechazada"), 'error');
        alert(`DIAGNOSIS DEL ERROR:\n\n` +
              `Mensaje: ${err.message}\n` +
              `Detalles: ${detailMsg}\n` +
              `Código: ${err.code}\n\n` +
              `Asegúrate de que la columna 'plan' exista en tu tabla 'stores' de Supabase.`);
    } finally {
        setLoading(btn, false);
    }
}

function toggleSidebarSuper(force) {
    const sidebar = document.getElementById('super-sidebar');
    if (!sidebar) return;
    
    if (typeof force === 'boolean') {
        if (force) sidebar.classList.add('open');
        else sidebar.classList.remove('open');
    } else {
        sidebar.classList.toggle('open');
    }
}

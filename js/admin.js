// ======================= ADMIN LOGIC =======================
async function initializeAdminUI() {
    if (!appState.tenant) return;
    
    document.getElementById('admin-store-name').innerText = appState.tenant.name;
    const mobileHeaderName = document.getElementById('mobile-store-name');
    if (mobileHeaderName) mobileHeaderName.innerText = appState.tenant.name;
    
    document.getElementById('setting-name').value = appState.tenant.name;
    if (document.getElementById('setting-slug')) {
        document.getElementById('setting-slug').value = appState.tenant.slug || '';
    }
    if (document.getElementById('setting-whatsapp')) {
        document.getElementById('setting-whatsapp').value = appState.tenant.whatsapp_phone || '';
    }
    if (document.getElementById('setting-currency')) {
        document.getElementById('setting-currency').value = appState.tenant.currency || 'USD';
    }

    // Delivery settings
    const deliveryCheck = document.getElementById('setting-delivery-active');
    const deliveryPrice = document.getElementById('setting-delivery-price');
    const deliveryContainer = document.getElementById('delivery-price-container');

    if (deliveryCheck) {
        deliveryCheck.checked = appState.tenant.active_delivery || false;
        deliveryContainer.style.display = deliveryCheck.checked ? 'block' : 'none';
        deliveryCheck.onchange = (e) => deliveryContainer.style.display = e.target.checked ? 'block' : 'none';
    }
    if (deliveryPrice) {
        deliveryPrice.value = appState.tenant.delivery_price || 0;
    }
    
    // Usar slug para el enlace si existe
    const storeIdentifier = appState.tenant.slug || appState.tenant.id;
    document.getElementById('store-link-input').value = window.location.origin + window.location.pathname + '?store=' + storeIdentifier;
    
    await updateUsageStats();
    await fetchProducts();
    await fetchCategories();
    await fetchOrders();

    // Comprobar si es Super Admin
    checkSuperAdmin();
}

async function updateUsageStats() {
    try {
        const { data, error } = await supabase.rpc('get_store_usage', { p_store_id: appState.tenant.id });
        if (error) throw error;

        const usage = data[0];
        appState.usage = usage;

        const badge = document.getElementById('store-plan-badge');
        if (badge) badge.innerText = usage.plan_name;

        const currentPlanName = document.getElementById('current-plan-name');
        if (currentPlanName) currentPlanName.innerText = usage.plan_name;

        const usageCount = document.getElementById('usage-count');
        const usageMax = document.getElementById('usage-max');
        const usageBar = document.getElementById('usage-bar-fill');
        
        if (usageCount) usageCount.innerText = usage.product_count;
        if (usageMax) usageMax.innerText = usage.max_products;
        if (usageBar) {
            const percent = Math.min((usage.product_count / usage.max_products) * 100, 100);
            usageBar.style.width = percent + '%';
        }

        const upgradeCta = document.getElementById('plan-upgrade-cta');
        if (upgradeCta) {
            upgradeCta.style.display = (usage.plan_name.toLowerCase().includes('pro')) ? 'none' : 'block';
        }
    } catch (err) {
        console.warn("Error updating usage stats:", err);
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
                superItem.onclick = () => showAdminSection('super');
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
        alert('Error: ' + err.message);
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
        alert('Error: ' + err.message);
    }
}

function renderProducts() {
    const grid = document.getElementById('grid-products');
    if (!grid) return;
    const currencySymbol = getCurrencySymbol(appState.tenant.currency);
    
    if (appState.products.length === 0) {
        grid.innerHTML = '<div class="col-span-full py-12 text-center text-slate-500">No tienes productos todavía. ¡Agrega el primero!</div>';
        return;
    }

    grid.innerHTML = appState.products.map(p => `
        <div class="card overflow-hidden !p-0 group hover:border-indigo-500/50 transition-all duration-300">
            <div class="relative h-48 overflow-hidden">
                <img src="${p.image || 'https://via.placeholder.com/300'}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                <div class="absolute top-2 right-2 flex gap-1">
                    <span class="px-2 py-1 rounded-md bg-slate-900/80 backdrop-blur-md text-[10px] font-bold text-white uppercase">${p.active ? 'Activo' : 'Oculto'}</span>
                </div>
            </div>
            <div class="p-4">
                <div class="flex justify-between items-start mb-2">
                    <h4 class="text-lg font-bold text-white truncate pr-2">${p.name}</h4>
                    <span class="text-indigo-400 font-bold">${currencySymbol}${parseFloat(p.price).toFixed(2)}</span>
                </div>
                <div class="flex gap-2 mt-4">
                    <button class="btn btn-secondary btn-sm flex-1 !rounded-lg" onclick="editProduct('${p.id}')">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        Editar
                    </button>
                    <button class="btn btn-danger btn-sm px-3 !rounded-lg" onclick="deleteProduct('${p.id}')">
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

// Abre el modal para CREAR un producto nuevo (limpia el estado anterior)
function openNewProductModal() {
    editingProductId = null;
    document.getElementById('modal-product-title').innerText = 'Agregar Producto';
    document.getElementById('p-name').value = '';
    document.getElementById('p-price').value = '';
    document.getElementById('p-description').value = '';
    document.getElementById('p-active').checked = true;
    
    // Reset image preview
    const preview = document.getElementById('image-preview');
    const previewCont = document.getElementById('image-preview-container');
    const prompt = document.getElementById('image-upload-prompt');
    if (preview) preview.src = '';
    if (previewCont) previewCont.classList.add('hidden');
    if (prompt) prompt.classList.remove('hidden');

    const fileInput = document.getElementById('p-image-file');
    if (fileInput) fileInput.value = '';
    openModal('modal-product');
}

function editProduct(id) {
    const p = appState.products.find(prod => prod.id === id);
    if (!p) return;
    editingProductId = id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-price').value = p.price;
    document.getElementById('p-category').value = p.category_id || '';
    document.getElementById('p-description').value = p.description || '';
    document.getElementById('p-active').checked = p.active !== false;
    
    // Set image preview
    const preview = document.getElementById('image-preview');
    const previewCont = document.getElementById('image-preview-container');
    const prompt = document.getElementById('image-upload-prompt');
    if (p.image && preview) {
        preview.src = p.image;
        if (previewCont) previewCont.classList.remove('hidden');
        if (prompt) prompt.classList.add('hidden');
    }

    document.getElementById('modal-product-title').innerText = "Editar Producto";
    openModal('modal-product');
}

function previewImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const preview = document.getElementById('image-preview');
        const previewCont = document.getElementById('image-preview-container');
        const prompt = document.getElementById('image-upload-prompt');
        
        if (preview) {
            preview.src = e.target.result;
            if (previewCont) previewCont.classList.remove('hidden');
            if (prompt) prompt.classList.add('hidden');
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
    
    if (appState.orders.length === 0) {
        list.innerHTML = '<div class="card text-center py-10 text-slate-500">No hay pedidos aún.</div>';
        dashList.innerHTML = '<p class="text-slate-500 italic text-center py-6">No hay pedidos recientes.</p>';
        return;
    }

    const currencySymbol = getCurrencySymbol(appState.tenant.currency);
    const html = appState.orders.map(o => {
        let itemsCount = 0;
        try {
            const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
            itemsCount = Array.isArray(items) ? items.reduce((sum, i) => sum + (i.qty || 1), 0) : 0;
        } catch (e) {
            console.error("Error parsing items for order:", o.id, e);
        }

        const date = new Date(o.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

        return `
            <div class="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex justify-between items-center group hover:border-slate-700 transition-all">
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 font-bold">
                        ${o.customer_name[0].toUpperCase()}
                    </div>
                    <div>
                        <p class="font-bold text-white">${o.customer_name}</p>
                        <p class="text-[11px] text-slate-500 uppercase tracking-wider">${date} • ${itemsCount} items</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold text-white mb-1">${currencySymbol}${parseFloat(o.total).toFixed(2)}</p>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter ${o.status === 'pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'}">
                        ${o.status === 'pending' ? 'Pendiente' : 'Completado'}
                    </span>
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = `<div class="space-y-4 p-4">${html}</div>`;
    dashList.innerHTML = html;

    const pending = appState.orders.filter(o => o.status === 'pending').length;
    const sales = appState.orders.reduce((sum, o) => sum + parseFloat(o.total), 0);
    
    const statOrders = document.getElementById('stat-orders');
    const statSales = document.getElementById('stat-sales');
    
    if (statOrders) statOrders.innerText = appState.orders.length;
    if (statSales) statSales.innerText = currencySymbol + sales.toFixed(2);
    
    const badge = document.getElementById('order-badge');
    if (badge) {
        if (pending > 0) {
            badge.style.display = 'block';
            badge.innerText = pending;
        } else {
            badge.style.display = 'none';
        }
    }
}

async function saveProduct(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    
    // Check plan limits
    if (!editingProductId && appState.usage) {
        if (appState.usage.product_count >= appState.usage.max_products) {
            alert(`Has alcanzado el límite de tu plan (${appState.usage.max_products} productos). Por favor, actualiza tu plan para agregar más.`);
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
            const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(fileName, file);
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
        alert("Error: " + err.message);
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
        alert("Error: " + err.message);
    }
}

// Function to load store settings into the form
function loadStoreSettingsForm() {
    const s = appState.tenant;
    if (!s) return;

    document.getElementById('setting-name').value = s.name || '';
    document.getElementById('setting-slug').value = s.slug || '';
    document.getElementById('setting-whatsapp').value = s.whatsapp_phone || '';
    document.getElementById('setting-currency').value = s.currency || 'USD';
    
    const deliveryCheck = document.getElementById('setting-delivery-active');
    const deliveryPriceInput = document.getElementById('setting-delivery-price');
    
    if (deliveryCheck) {
        deliveryCheck.checked = s.active_delivery === true;
        toggleDeliveryPriceUI();
    }
    if (deliveryPriceInput) {
        deliveryPriceInput.value = s.delivery_price || 0;
    }

    // Logo preview
    const logoPreview = document.getElementById('setting-logo-preview');
    const logoPlaceholder = document.getElementById('setting-logo-placeholder');
    if (s.logo_url && logoPreview) {
        logoPreview.src = s.logo_url;
        logoPreview.classList.remove('hidden');
        if (logoPlaceholder) logoPlaceholder.classList.add('hidden');
    } else if (logoPreview) {
        logoPreview.src = '';
        logoPreview.classList.add('hidden');
        if (logoPlaceholder) logoPlaceholder.classList.remove('hidden');
    }
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
        }
    };
    reader.readAsDataURL(file);
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
            const fileExt = logoFile.name.split('.').pop();
            const fileName = `${appState.tenant.id}/logo_${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
                .from('products')
                .upload(fileName, logoFile, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: publicData } = supabase.storage
                .from('products')
                .getPublicUrl(fileName);
            logoUrl = publicData.publicUrl;
        }

        const { data, error } = await supabase
            .from('stores')
            .update({
                name: nameInput.value.trim(),
                slug: slugInput.value.trim().toLowerCase(),
                whatsapp_phone: whatsappInput.value.trim(),
                currency: currencyInput.value,
                active_delivery: deliveryCheck.checked,
                delivery_price: parseFloat(deliveryPriceInput.value) || 0,
                logo_url: logoUrl
            })
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
        list.innerHTML = stores.map(s => `
            <div style="padding: 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; background: ${s.active ? 'white' : '#f8fafc'};">
                <div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <h4 style="margin: 0; font-weight: 700;">${s.name}</h4>
                        <span style="font-size: 10px; padding: 2px 8px; border-radius: 20px; background: ${s.active ? '#dcfce7' : '#fee2e2'}; color: ${s.active ? '#166534' : '#991b1b'}; font-weight: 800; text-transform: uppercase;">
                            ${s.active ? 'Activa' : 'Desactivada'}
                        </span>
                    </div>
                    <p style="font-size: 13px; color: var(--text-sec); margin-top: 4px;">
                        Slug: <strong>${s.slug || 'N/A'}</strong> | WhatsApp: ${s.whatsapp_phone || 'N/A'}
                    </p>
                    <p style="font-size: 11px; color: #94a3b8; margin-top: 2px;">ID: ${s.id}</p>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-secondary btn-sm" onclick="toggleStoreActive('${s.id}', ${s.active})">
                        ${s.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteStoreByAdmin('${s.id}')">Eliminar</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        showToast("Error cargando dashboard global", "error");
    }
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
        alert("Tienda eliminada");
        fetchGlobalStores();
    } catch (err) {
        alert("Error: " + err.message);
    }
}

let editingStoreId = null;

function openStoreModal() {
    editingStoreId = null;
    document.getElementById('modal-store-title').innerText = "Crear Nueva Tienda";
    document.getElementById('s-name').value = '';
    document.getElementById('s-slug').value = '';
    document.getElementById('s-type').value = 'Otros';
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
        openModal('modal-store');
    } catch (err) {
        alert("Error cargando datos: " + err.message);
    }
}

async function saveStoreByAdmin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const store = {
        name: document.getElementById('s-name').value,
        slug: document.getElementById('s-slug').value || null,
        type: document.getElementById('s-type').value
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
            const { error } = await supabase.from('stores').update(store).eq('id', editingStoreId);
            if (error) throw error;
            alert("Tienda actualizada");
        } else {
            // Nota: Al crear por admin no asociamos owner_id real a menos que lo pidas
            store.owner_id = appState.session?.user?.id || null;
            const { error } = await supabase.from('stores').insert([store]);
            if (error) throw error;
            alert("Tienda creada con éxito");
        }
        
        closeModal('modal-store');
        fetchGlobalStores();
    } catch (err) {
        alert("Error: " + err.message);
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

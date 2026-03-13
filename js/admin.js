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
    
    await fetchProducts();
    await fetchCategories();
    await fetchOrders();

    // Comprobar si es Super Admin
    checkSuperAdmin();
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
    grid.innerHTML = appState.products.map(p => `
        <div class="card product-card-admin" style="padding: 0; overflow: hidden; display: flex; flex-direction: column;">
            <img src="${p.image || 'https://via.placeholder.com/300'}" style="width: 100%; height: 150px; object-fit: cover;">
            <div class="card-body" style="padding: 12px; flex: 1;">
                <h4 style="font-weight: 600; margin-bottom: 4px;">${p.name}</h4>
                <p style="color: var(--accent); font-weight: 700; margin-bottom: 12px;">${currencySymbol}${parseFloat(p.price).toFixed(2)}</p>
                <div class="btn-group" style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="editProduct('${p.id}')">Editar</button>
                    <button class="btn btn-danger btn-sm" style="flex: 1;" onclick="deleteProduct('${p.id}')">Eliminar</button>
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
    document.getElementById('modal-product-title').innerText = "Editar Producto";
    openModal('modal-product');
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
        list.innerHTML = '<div class="card">No hay pedidos aún.</div>';
        dashList.innerHTML = '<p style="color: var(--text-sec);">No hay pedidos recientes.</p>';
        return;
    }

    const currencySymbol = getCurrencySymbol(appState.tenant.currency);
    const html = appState.orders.map(o => {
        let itemsCount = 0;
        try {
            // Si es string (legacy o error), parseamos. Si ya es objeto/array, usamos length.
            const items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
            itemsCount = Array.isArray(items) ? items.length : 0;
        } catch (e) {
            console.error("Error parsing items for order:", o.id, e);
        }

        return `
            <div style="padding: 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <p style="font-weight: 600;">${o.customer_name}</p>
                    <p style="font-size: 12px; color: var(--text-sec);">${itemsCount} productos - ${currencySymbol}${parseFloat(o.total).toFixed(2)}</p>
                </div>
                <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; background: ${o.status === 'pending' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)'}; color: ${o.status === 'pending' ? 'var(--accent)' : 'var(--success)'};">
                    ${o.status}
                </span>
            </div>
        `;
    }).join('');

    list.innerHTML = html;
    dashList.innerHTML = html;

    const pending = appState.orders.filter(o => o.status === 'pending').length;
    const sales = appState.orders.reduce((sum, o) => sum + parseFloat(o.total), 0);
    document.getElementById('stat-orders').innerText = pending;
    document.getElementById('stat-sales').innerText = currencySymbol + sales.toFixed(2);
    
    const badge = document.getElementById('order-badge');
    if (badge) {
        if (pending > 0) {
            badge.style.display = 'inline';
            badge.innerText = pending;
        } else {
            badge.style.display = 'none';
        }
    }
}

async function saveProduct(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
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
        }

        const product = {
            store_id: appState.tenant.id,
            name: document.getElementById('p-name').value,
            price: Number(parseFloat(document.getElementById('p-price').value) || 0),
            category_id: document.getElementById('p-category').value || null,
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

async function updateStoreSettings() {
    const newName    = document.getElementById('setting-name').value.trim();
    const newSlug    = document.getElementById('setting-slug')?.value.trim() || appState.tenant.slug;
    const newPhone   = document.getElementById('setting-whatsapp')?.value.trim() || '';
    const newCurrency = document.getElementById('setting-currency')?.value || 'USD';
    
    const deliveryActive = document.getElementById('setting-delivery-active')?.checked || false;
    const deliveryPrice = parseFloat(document.getElementById('setting-delivery-price')?.value || 0);
    
    if (!newName) return alert('El nombre de la tienda no puede estar vacío.');

    try {
        const { data, error } = await supabase
            .from('stores')
            .update({ 
                name: newName, 
                slug: newSlug, 
                whatsapp_phone: newPhone,
                currency: newCurrency,
                active_delivery: deliveryActive,
                delivery_price: deliveryPrice
            })
            .eq('id', appState.tenant.id)
            .select()
            .single();
        
        if (error) throw error;
        appState.tenant = data;
        document.getElementById('admin-store-name').innerText = data.name;
        alert('Configuración actualizada correctamente.');
        initializeAdminUI();
    } catch (err) {
        alert('Error: ' + err.message);
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

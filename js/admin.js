// ======================= ADMIN LOGIC =======================
async function initializeAdminUI() {
    if (!appState.tenant) return;
    
    document.getElementById('admin-store-name').innerText = appState.tenant.name;
    document.getElementById('setting-name').value = appState.tenant.name;
    if (document.getElementById('setting-slug')) {
        document.getElementById('setting-slug').value = appState.tenant.slug || '';
    }
    
    // Usar slug para el enlace si existe
    const storeIdentifier = appState.tenant.slug || appState.tenant.id;
    document.getElementById('store-link-input').value = window.location.origin + window.location.pathname + '?store=' + storeIdentifier;
    
    await fetchProducts();
    await fetchOrders();
}

async function fetchProducts() {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', appState.tenant.id)
        .order('created_at', { ascending: false });
    
    if (data) {
        appState.products = data;
        renderProducts();
    }
}

function renderProducts() {
    const grid = document.getElementById('grid-products');
    if (!grid) return;
    grid.innerHTML = appState.products.map(p => `
        <div class="card" style="padding: 0; overflow: hidden;">
            <img src="${p.image || 'https://via.placeholder.com/300'}" style="width: 100%; height: 150px; object-fit: cover;">
            <div style="padding: 12px;">
                <h4 style="font-weight: 600;">${p.name}</h4>
                <p style="color: var(--accent); font-weight: 700;">$${parseFloat(p.price).toFixed(2)}</p>
                <div style="display: flex; gap: 8px; margin-top: 8px;">
                    <button class="btn btn-secondary btn-sm" onclick="editProduct('${p.id}')">Editar</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')">Eliminar</button>
                </div>
            </div>
        </div>
    `).join('');
}

let editingProductId = null;

function editProduct(id) {
    const p = appState.products.find(prod => prod.id === id);
    if (!p) return;
    editingProductId = id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-price').value = p.price;
    document.getElementById('modal-product-title').innerText = "Editar Producto";
    openModal('modal-product');
}

async function fetchOrders() {
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('store_id', appState.tenant.id)
        .order('created_at', { ascending: false });
    
    if (data) {
        appState.orders = data;
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

    const html = appState.orders.map(o => `
        <div style="padding: 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
            <div>
                <p style="font-weight: 600;">${o.customer_name}</p>
                <p style="font-size: 12px; color: var(--text-sec);">${(JSON.parse(o.items || '[]')).length} items - $${parseFloat(o.total).toFixed(2)}</p>
            </div>
            <span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; background: ${o.status === 'pending' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)'}; color: ${o.status === 'pending' ? 'var(--accent)' : 'var(--success)'};">
                ${o.status}
            </span>
        </div>
    `).join('');

    list.innerHTML = html;
    dashList.innerHTML = html;

    const pending = appState.orders.filter(o => o.status === 'pending').length;
    const sales = appState.orders.reduce((sum, o) => sum + parseFloat(o.total), 0);
    document.getElementById('stat-orders').innerText = pending;
    document.getElementById('stat-sales').innerText = '$' + sales.toFixed(2);
    
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
        if (file) {
            const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(fileName, file);
            
            if (uploadError) throw uploadError;
            
            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(fileName);
            
            imageUrl = publicUrl;
        }

        const product = {
            store_id: appState.tenant.id,
            name: document.getElementById('p-name').value,
            price: parseFloat(document.getElementById('p-price').value),
            image: imageUrl
        };

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
        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) throw error;
        await fetchProducts();
    } catch (err) {
        alert("Error: " + err.message);
    }
}

async function updateStoreSettings() {
    const newName = document.getElementById('setting-name').value;
    const newSlug = document.getElementById('setting-slug')?.value || appState.tenant.slug;
    
    try {
        const { data, error } = await supabase
            .from('stores')
            .update({ name: newName, slug: newSlug })
            .eq('id', appState.tenant.id)
            .select()
            .single();
        
        if (error) throw error;
        appState.tenant = data;
        document.getElementById('admin-store-name').innerText = data.name;
        alert("Configuración actualizada");
        initializeAdminUI();
    } catch (err) {
        alert("Error: " + err.message);
    }
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// ======================= SUPER ADMIN ACTIONS =======================
async function fetchGlobalStores() {
    try {
        const { data: stores, error: sErr } = await supabase.from('stores').select('*');
        if (sErr) throw sErr;

        const { data: totalOrders, error: oErr } = await supabase.from('orders').select('id', { count: 'exact' });
        
        document.getElementById('super-total-stores').innerText = stores.length;
        document.getElementById('super-total-orders').innerText = totalOrders ? totalOrders.length : 0;

        const list = document.getElementById('super-stores-list');
        list.innerHTML = stores.map(s => `
            <div style="padding: 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <p style="font-weight: 600;">${s.name}</p>
                    <p style="font-size: 12px; color: var(--text-sec);">${s.type} | Slug: ${s.slug || 'N/A'}</p>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn btn-secondary btn-sm" onclick="window.open('?store=${s.id}', '_blank')">Ver</button>
                    <button class="btn btn-primary btn-sm" onclick="editStoreByAdmin('${s.id}')">Editar</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteStoreByAdmin('${s.id}')">Borrar</button>
                </div>
            </div>
        `).join('') || '<div style="padding: 20px; text-align: center; color: var(--text-sec);">No hay tiendas registradas.</div>';

    } catch (err) {
        console.error("SuperAdmin Error:", err);
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
        if (editingStoreId) {
            const { error } = await supabase.from('stores').update(store).eq('id', editingStoreId);
            if (error) throw error;
            alert("Tienda actualizada");
        } else {
            // Nota: Al crear por admin no asociamos owner_id real a menos que lo pidas
            // Por ahora, usaremos el mismo session user o null
            store.owner_id = appState.session.user.id;
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

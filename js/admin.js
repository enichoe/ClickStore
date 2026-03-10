// ======================= ADMIN LOGIC =======================
async function initializeAdminUI() {
    if (!appState.tenant) return;
    
    document.getElementById('admin-store-name').innerText = appState.tenant.name;
    document.getElementById('setting-name').value = appState.tenant.name;
    document.getElementById('store-link-input').value = window.location.origin + window.location.pathname + '?store=' + appState.tenant.id;
    
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
                <button class="btn btn-danger btn-sm" style="margin-top: 8px;" onclick="deleteProduct(${p.id})">Eliminar</button>
            </div>
        </div>
    `).join('');
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
    const product = {
        store_id: appState.tenant.id,
        name: document.getElementById('p-name').value,
        price: parseFloat(document.getElementById('p-price').value),
        image: document.getElementById('p-image').value
    };

    setLoading(btn, true);
    try {
        const { error } = await supabase.from('products').insert([product]);
        if (error) throw error;
        
        await fetchProducts();
        if (typeof closeModal === 'function') closeModal('modal-product');
        e.target.reset();
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
    try {
        const { error } = await supabase
            .from('stores')
            .update({ name: newName })
            .eq('id', appState.tenant.id);
        
        if (error) throw error;
        appState.tenant.name = newName;
        document.getElementById('admin-store-name').innerText = newName;
        alert("Configuración actualizada");
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

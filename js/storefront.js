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
            
        if (sErr || !store) throw new Error("Tienda no encontrada");

        const { data: prods } = await supabase.from('products').select('*').eq('store_id', store.id);
        const { data: cats }  = await supabase.from('categories').select('*').eq('store_id', store.id).order('name', { ascending: true });
        
        appState.tenant = store;
        appState.products = prods || [];
        appState.categories = cats || [];
        
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
    const identifier = appState.tenant.slug || appState.tenant.id;
    window.open(window.location.origin + window.location.pathname + '?store=' + identifier, '_blank');
}

function renderStorefront() {
    const navTitle = document.getElementById('store-title-nav');
    const mainTitle = document.getElementById('store-title-main');
    if (navTitle) navTitle.innerText = appState.tenant.name;
    if (mainTitle) mainTitle.innerText = appState.tenant.name;
    
    // Símbolo de moneda según configuración de la tienda
    const currencySymbol = getCurrencySymbol(appState.tenant.currency);

    if (appState.categories.length > 0) {
        // Renderizar por categorías
        grid.innerHTML = appState.categories.map(cat => {
            const catProds = appState.products.filter(p => p.category_id === cat.id);
            if (catProds.length === 0) return '';

            return `
                <div style="grid-column: 1 / -1; margin-top: 32px; border-bottom: 2px solid var(--accent); padding-bottom: 8px;">
                    <h2 style="font-size: 24px;">${cat.name}</h2>
                </div>
                ${catProds.map(p => renderProductCard(p, currencySymbol)).join('')}
            `;
        }).join('');

        // Productos sin categoría
        const noCatProds = appState.products.filter(p => !p.category_id);
        if (noCatProds.length > 0) {
            grid.innerHTML += `
                <div style="grid-column: 1 / -1; margin-top: 32px; border-bottom: 2px solid var(--border); padding-bottom: 8px;">
                    <h2 style="font-size: 24px; color: var(--text-sec);">Otros</h2>
                </div>
                ${noCatProds.map(p => renderProductCard(p, currencySymbol)).join('')}
            `;
        }
    } else {
        // Renderizado simple original
        grid.innerHTML = appState.products.map(p => renderProductCard(p, currencySymbol)).join('');
    }
}

function renderProductCard(p, currencySymbol) {
    return `
        <div class="card" style="padding: 0; overflow: hidden; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
            <img src="${p.image || 'https://via.placeholder.com/300'}" style="width: 100%; height: 180px; object-fit: cover;">
            <div style="padding: 16px;">
                <h4 style="font-weight: 600; margin-bottom: 4px;">${p.name}</h4>
                <p style="color: var(--accent); font-weight: 700; font-size: 18px;">${currencySymbol}${parseFloat(p.price).toFixed(2)}</p>
                <button class="btn btn-primary w-full" style="margin-top: 12px;" onclick="addToCart('${p.id}')">Agregar</button>
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
                    <p style="font-weight: 500;">${i.name}</p>
                    <p style="font-size: 12px; color: var(--text-sec);">Cantidad: ${i.qty}</p>
                </div>
                <p style="font-weight: 700;">${currencySymbol}${(i.price * i.qty).toFixed(2)}</p>
            </div>
        `;
    }).join('');
    
    const cartTotal = document.getElementById('cart-total');
    if (cartTotal) cartTotal.innerText = currencySymbol + total.toFixed(2);
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

            const customerName = e.target[0].value.trim();
            const customerWhatsapp = e.target[1].value.trim();

            setLoading(btn, true);
            try {
                if (!appState.tenant || !appState.tenant.id) throw new Error('Tienda no definida.');
                if (!appState.cart || appState.cart.length === 0) throw new Error('El carrito está vacío.');
                if (!customerName) throw new Error('Ingresa tu nombre.');

                const customerWhatsappClean = customerWhatsapp.replace(/\D/g, '');
                if (!customerWhatsappClean) throw new Error('Ingresa un número de WhatsApp válido.');

                // Verificar que el negocio tiene WhatsApp configurado
                const businessPhone = (appState.tenant.whatsapp_phone || '').replace(/\D/g, '');
                if (!businessPhone) {
                    throw new Error('Esta tienda aún no tiene número de WhatsApp configurado. El dueño debe agregarlo en Configuración.');
                }

                // Preparar items para la función RPC (solo id y qty — el precio lo calcula el servidor)
                const itemsForRpc = appState.cart.map(i => ({ id: i.id, qty: i.qty }));

                // Llamar a la función RPC server-side con los nuevos nombres de parámetros
                const { data: orderId, error } = await supabase.rpc('create_order', {
                    p_store_id:      appState.tenant.id,
                    p_customer_name: customerName,
                    p_whatsapp:      customerWhatsapp,
                    p_items:         itemsForRpc
                });

                if (error) throw error;

                // Calcular total local solo para mostrar en el mensaje de WhatsApp
                const displayTotal = appState.cart.reduce((sum, i) => sum + (i.price * i.qty), 0);

                // Construir mensaje de WhatsApp para el negocio
                const businessName = appState.tenant.name;
                const itemsText = appState.cart
                    .map(i => `- ${i.name} x${i.qty} ($${(i.price * i.qty).toFixed(2)})`)
                    .join('%0A');
                const message = [
                    `*🛍️ Nuevo Pedido - ${businessName}*`,
                    ``,
                    `*Cliente:* ${customerName}`,
                    `*WhatsApp cliente:* ${customerWhatsapp}`,
                    ``,
                    `*Productos:*`,
                    appState.cart.map(i => `- ${i.name} x${i.qty} ($${(i.price * i.qty).toFixed(2)})`).join('\n'),
                    ``,
                    `*Total estimado:* $${displayTotal.toFixed(2)}`
                ].join('%0A');

                // Abrir WhatsApp del NEGOCIO (no del cliente)
                window.open(`https://wa.me/${businessPhone}?text=${message}`, '_blank');

                alert('¡Pedido enviado con éxito! Se abrirá WhatsApp para confirmar.');
                appState.cart = [];
                updateCartBadge();
                if (typeof closeModal === 'function') closeModal('modal-cart');
                e.target.reset();
            } catch (err) {
                alert('Error enviando pedido: ' + err.message);
            } finally {
                setLoading(btn, false);
            }
        });
    }
});

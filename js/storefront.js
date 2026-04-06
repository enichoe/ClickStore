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
        if (logoImgNav) {
            logoImgNav.src = appState.tenant.logo_url;
            logoImgNav.classList.remove('hidden');
        }
        if (logoPlaceholderNav) logoPlaceholderNav.classList.add('hidden');
    } else {
        if (logoImgNav) logoImgNav.classList.add('hidden');
        if (logoPlaceholderNav) {
            logoPlaceholderNav.classList.remove('hidden');
            logoPlaceholderNav.innerText = initial;
        }
    }

    // Hero Logo
    if (appState.tenant.logo_url) {
        if (logoImgHero) {
            logoImgHero.src = appState.tenant.logo_url;
            logoImgHero.classList.remove('hidden');
            logoImgHero.style.display = 'block'; // Ensure it's visible if it was hidden
        }
        if (logoPlaceholderHero) logoPlaceholderHero.style.display = 'none';
    } else {
        if (logoImgHero) logoImgHero.style.display = 'none';
        if (logoPlaceholderHero) {
            logoPlaceholderHero.style.display = 'flex';
            logoPlaceholderHero.innerText = initial;
            // Use accent color for placeholder if available
            if (appState.tenant.accent_color) {
                logoPlaceholderHero.style.backgroundColor = appState.tenant.accent_color;
            }
        }
    }

    const titleNav = document.getElementById('store-title-nav');
    const titleMain = document.getElementById('store-title-main');
    const tagline = document.getElementById('store-tagline');

    if (tagline) tagline.innerText = appState.tenant.description || 'Bienvenido a nuestra tienda virtual.';

    // 1.5. Configuración del Banner
    const heroBanner = document.querySelector('.store-hero-banner');
    const bannerImg = document.getElementById('store-banner-img');
    const bannerOverlay = document.getElementById('store-banner-overlay');

    if (heroBanner) {
        const bgImg = appState.tenant.store_banner_bg;
        const accent = appState.tenant.accent_color || '#4f46e5';

        if (bgImg) {
            if (bannerImg) {
                bannerImg.src = bgImg;
                bannerImg.classList.remove('hidden');
            }
            if (bannerOverlay) bannerOverlay.classList.remove('hidden');
            heroBanner.style.background = '#000'; // Dark base for loading
        } else {
            if (bannerImg) bannerImg.classList.add('hidden');
            if (bannerOverlay) bannerOverlay.classList.add('hidden');
        }
    }

    // 2. Redes Sociales
    renderSocialLinks();
    
    // 3. Categorías
    renderCategoryFilter();
    
    // 4. Grid de Productos
    renderProductGrid();

    // 5. SEO / Document Update
    if (appState.tenant) {
        document.title = `🛍️ ${appState.tenant.name} - StoreClick`;
        
        // Update Meta Tags (Best effort for browsers)
        const metaOgTitle = document.querySelector('meta[property="og:title"]');
        const metaOgDesc = document.querySelector('meta[property="og:description"]');
        const metaOgImg = document.querySelector('meta[property="og:image"]');
        const metaTwitterTitle = document.querySelector('meta[name="twitter:title"]');
        
        if (metaOgTitle) metaOgTitle.setAttribute('content', `${appState.tenant.name} - Tienda Oficial`);
        if (metaOgDesc) metaOgDesc.setAttribute('content', appState.tenant.description || 'Haz tu pedido por WhatsApp en nuestra tienda.');
        if (metaOgImg && appState.tenant.logo_url) metaOgImg.setAttribute('content', appState.tenant.logo_url);
        if (metaTwitterTitle) metaTwitterTitle.setAttribute('content', `${appState.tenant.name} en StoreClick`);
    }

    // 6. Efecto Scroll Nav
    handleNavScroll();
}

function handleNavScroll() {
    const nav = document.getElementById('main-nav');
    window.onscroll = () => {
        if (window.scrollY > 80) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    };
}

function renderSocialLinks() {
    const navSocialDiv = document.getElementById('store-social-links');
    const heroSocialDiv = document.getElementById('hero-social-links');
    
    if (!navSocialDiv && !heroSocialDiv) return;

    const SOCIAL_DATA = [
        { id: 'whatsapp_url', key: 'whatsapp', name: 'WhatsApp', icon: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>' },
        { id: 'instagram_url', key: 'instagram', name: 'Instagram', icon: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.919-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849C1.721 3.842 3.23 2.3 6.485 2.163 7.751 2.112 8.132 2.1 11.336 2.1h.664zM12 0C8.741 0 8.332.013 7.052.072 2.695.272.273 2.69.073 7.052.013 8.332 0 8.741 0 12c0 3.259.013 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.013 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4.162 4.162 0 1 1 0-8.324A4.162 4.162 0 0 1 12 16zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>' },
        { id: 'facebook_url', key: 'facebook', name: 'Facebook', icon: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>' },
        { id: 'tiktok_url', key: 'tiktok', name: 'TikTok', icon: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.1-3.44-3.37-3.5-5.75-.12-2.13.86-4.23 2.49-5.59 1.49-1.28 3.4-1.91 5.35-1.65v4.26c-.99-.25-2.09.08-2.81.84-.54.53-.83 1.29-.81 2.04.01.76.35 1.51.94 2.01.61.48 1.41.67 2.17.51.98-.16 1.83-.93 2.03-1.91.07-.36.07-.74.07-1.11V0z"/></svg>' },
        { id: 'youtube_url', key: 'youtube', name: 'YouTube', icon: '<svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
    ];

    const BRAND_COLORS = {
        whatsapp: '#25D366',
        instagram: '#E4405F',
        facebook: '#1877F2',
        tiktok: '#000000',
        youtube: '#FF0000'
    };

    if (navSocialDiv) navSocialDiv.innerHTML = '';
    if (heroSocialDiv) heroSocialDiv.innerHTML = '';

    // Ordenar: WhatsApp siempre primero
    const sortedData = [...SOCIAL_DATA].sort((a, b) => {
        if (a.key === 'whatsapp') return -1;
        if (b.key === 'whatsapp') return 1;
        return 0;
    });

    sortedData.forEach((item, index) => {
        const url = appState.tenant[item.id];
        if (url) {
            // Render Nav Links (SOLO HASTA 2)
            if (navSocialDiv && index < 2) {
                const a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                a.className = 'text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 p-2 rounded-xl border border-slate-100 flex items-center justify-center';
                a.innerHTML = item.icon;
                navSocialDiv.appendChild(a);
            }

            // Render Hero Links
            if (heroSocialDiv) {
                const a = document.createElement('a');
                a.href = url;
                a.target = '_blank';
                a.className = 'social-btn-hero';
                a.dataset.network = item.key;
                a.dataset.tooltip = item.name;
                // Iconos con color de marca por defecto
                a.innerHTML = `
                    <span class="social-icon" style="color: ${BRAND_COLORS[item.key]}; transition: transform 0.3s;">${item.icon}</span>
                    ${item.key === 'whatsapp' ? '<span class="wsp-label-badge">Escríbenos</span>' : ''}
                `;

                heroSocialDiv.appendChild(a);
            }
        }
    });
}

// Utility to darken/lighten color
function adjustColor(hex, percent) {
    var num = parseInt(hex.replace("#",""),16),
    amt = Math.round(2.55 * percent),
    R = (num >> 16) + amt,
    G = (num >> 8 & 0x00FF) + amt,
    B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R<255?R<0?0:R:255)*0x10000 + (G<255?G<0?0:G:255)*0x100 + (B<255?B<0?0:B:255)).toString(16).slice(1);
}



function renderCategoryFilter() {
    const bar = document.getElementById('category-filter-bar');
    if (!bar) return;

    if (appState.categories.length === 0) {
        bar.parentElement.parentElement.classList.add('hidden');
        return;
    }

    bar.parentElement.parentElement.classList.remove('hidden');
    
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
            <span>🎯</span>
            Todos
            <span class="ml-1 opacity-50 px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] text-slate-800 font-bold">${totalCount}</span>
        </button>`;
        
    const catBtns = appState.categories.map((c, idx) => {
        const count = counts[c.id] || 0;
        return `
            <button class="cat-btn ${appState.selectedCategory === c.id ? 'active' : ''}" onclick="filterByCategory('${c.id}')">
                <span>${icons[idx % icons.length]}</span>
                ${c.name}
                <span class="ml-1 opacity-50 px-1.5 py-0.5 rounded-full bg-slate-100 text-[10px] text-slate-800 font-bold">${count}</span>
            </button>
        `;
    }).join('');

    bar.innerHTML = allBtn + catBtns;
    
    // Actualizar visibilidad de botones de scroll
    setTimeout(() => checkScroll(), 10);
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

function scrollCategories(direction) {
    const bar = document.getElementById('category-filter-bar');
    if (!bar) return;
    
    const scrollAmount = 250;
    if (direction === 'left') {
        bar.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    } else {
        bar.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
    
    setTimeout(() => checkScroll(), 100);
}

function checkScroll() {
    const bar = document.getElementById('category-filter-bar');
    const btnLeft = document.getElementById('scroll-left');
    const btnRight = document.getElementById('scroll-right');
    
    if (!bar || !btnLeft || !btnRight) return;
    
    const hasOverflow = bar.scrollWidth > bar.clientWidth;
    
    if (!hasOverflow) {
        btnLeft.classList.remove('active');
        btnRight.classList.remove('active');
        return;
    }
    
    // Mostrar botón izquierdo solo si no estamos al inicio
    if (bar.scrollLeft > 0) {
        btnLeft.classList.add('active');
    } else {
        btnLeft.classList.remove('active');
    }
    
    // Mostrar botón derecho solo si hay más contenido a la derecha
    if (bar.scrollLeft < bar.scrollWidth - bar.clientWidth - 10) {
        btnRight.classList.add('active');
    } else {
        btnRight.classList.remove('active');
    }
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
            <div class="product-image-container relative p-4">
                <div class="product-image-inner">
                    <img src="${p.image || ''}" alt="${p.name}" class="w-full h-full object-cover" ${p.image ? '' : 'style="display: none;"'}>
                    <div class="absolute inset-0 flex items-center justify-center text-slate-400 text-5xl" ${p.image ? 'style="display: none;"' : ''}>📦</div>
                    <div class="product-price-badge">${currencySymbol}${parseFloat(p.price).toFixed(2)}</div>
                </div>
            </div>
            <div class="px-6 pb-6 flex flex-col flex-1">
                <h4 class="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 mb-2">${p.name}</h4>
                <p class="text-sm text-slate-500 line-clamp-2 leading-relaxed flex-1">${p.description || 'Sin descripción adicional'}</p>
                <button type="button" class="w-full mt-4 bg-indigo-600 text-white font-black rounded-xl py-3 hover:bg-indigo-700 active:scale-95 transition-all" onclick="addToCart('${p.id}')">
                    Agregar ${currencySymbol}${parseFloat(p.price).toFixed(2)}
                </button>
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
    
    // Animación Bounce en Carrito
    const cartBtn = document.getElementById('cart-count');
    if (cartBtn) {
        cartBtn.classList.remove('cart-bounce');
        void cartBtn.offsetWidth; // Force reflow
        cartBtn.classList.add('cart-bounce');
    }

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
                    <img src="${i.image || 'https://via.placeholder.com/100'}" class="w-full h-full object-cover">
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
    const digitalContainer = digitalInfo?.querySelector('div.border'); // Primer div hijo con clase border
    
    if (method === 'cash') {
        digitalInfo.classList.add('hidden');
    } else {
        digitalInfo.classList.remove('hidden');
        methodName.innerText = `Paga con ${method.toUpperCase()}`;
        
        // Actualizar colores según método
        if (digitalContainer) {
            digitalContainer.classList.remove('bg-slate-50', 'bg-purple-50', 'bg-teal-50', 'border-slate-200', 'border-purple-200', 'border-teal-200');
            methodName.classList.remove('text-slate-900', 'text-purple-700', 'text-teal-700');
            
            if (method === 'yape') {
                // Morado
                digitalContainer.classList.add('bg-purple-50', 'border-purple-200');
                methodName.classList.add('text-purple-700');
            } else if (method === 'plin') {
                // Celeste/Teal
                digitalContainer.classList.add('bg-teal-50', 'border-teal-200');
                methodName.classList.add('text-teal-700');
            } else {
                digitalContainer.classList.add('bg-slate-50', 'border-slate-200');
                methodName.classList.add('text-slate-900');
            }
        }
        
        // Cargar QR 
        const qrUrl = appState.tenant[`${method}_qr_url`];
        const qrImg = document.getElementById('pay-qr-img');
        
        if (qrUrl && qrImg) {
            qrImg.src = qrUrl;
            qrImg.classList.remove('hidden');
        } else {
            if (qrImg) qrImg.classList.add('hidden');
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

        // Crear pedido usando la función segura
        const itemsForRpc = appState.cart.map(i => ({ id: i.id, qty: i.qty, name: i.name, price: i.price }));
        
        // Generar una referencia única local para el mensaje
        const orderRef = 'CMD-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        // Usar createOrderSecure en lugar de insert directo
        const orderResult = await createOrderSecure(
            appState.tenant.id,
            appState.cart,
            customerName,
            customerWhatsapp
        );

        if (!orderResult.success) {
            throw new Error(orderResult.error || 'Error creating order');
        }

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

        message += `📲 _Ref: ${orderRef}_%0A`;
        message += `🛒 _Creado en https://click-store-weld.vercel.app/_`;

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
    // Event listeners para scroll de categorías
    const bar = document.getElementById('category-filter-bar');
    if (bar) {
        bar.addEventListener('scroll', checkScroll);
        bar.addEventListener('scrollend', checkScroll);
    }
    
    // Detectar cambios en tamaño de ventana
    window.addEventListener('resize', () => setTimeout(checkScroll, 100));
    
    // Ejecutar checkScroll cuando las categorías se renderizan
    const observer = new MutationObserver(() => {
        setTimeout(checkScroll, 50);
    });
    
    if (bar) {
        observer.observe(bar, { childList: true });
    }
});

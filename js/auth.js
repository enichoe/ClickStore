// ======================= AUTH (SUPABASE) =======================
async function checkSession() {
    if (window.initSupabasePromise) await window.initSupabasePromise;
    try { requireSupabase(); } catch(e) { console.error(e.message); showView('view-landing'); return; }

    // 1. Priorizar ver tienda pública si hay parámetro ?store=
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('store')) {
        const storeId = urlParams.get('store');
        console.log("Cargando tienda pública:", storeId);
        if (typeof loadPublicStore === 'function') {
            await loadPublicStore(storeId);
            return; // Detener aquí para que no salte al admin si está logueado
        }
    }

    if (typeof DEV_MODE !== 'undefined' && DEV_MODE) {
        console.warn("MODO DESARROLLADOR ACTIVO: Saltando autenticación real.");
        appState.session = { user: { id: 'mock-user-id', email: SUPER_ADMIN_EMAIL } };
        showView('view-superadmin');
        fetchGlobalStores();
        return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        appState.session = session;
        console.log("Logged in as:", session.user.email);
        
        if (session.user.email === SUPER_ADMIN_EMAIL) {
            showView('view-superadmin');
            fetchGlobalStores();
            return;
        }

        await loadStoreData(session.user.id);
    } else {
        showView('view-landing');
    }
}

async function loadStoreData(identifier) {
    try {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        let query = supabase.from('stores').select('*');
        
        if (isUUID) {
            query = query.eq('owner_id', identifier);
        } else {
            query = query.eq('slug', identifier);
        }

        const { data, error } = await query.maybeSingle();

        if (error) throw error;
        if (data) {
            appState.tenant = data;
            if (typeof initializeAdminUI === 'function') initializeAdminUI();
        }
    } catch (err) {
        console.error("Error cargando tienda:", err);
    }
}

async function handleLogin(btn) {
    if (window.initSupabasePromise) await window.initSupabasePromise;
    try { requireSupabase(); } catch(e) { return alert(e.message); }

    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-pass').value;

    if (!email || !pass) return alert('Completa el email y la contraseña.');

    if (btn) setLoading(btn, true);
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        appState.session = data.session;

        // Si el usuario es super admin, mostrar panel maestro
        if (data.user && data.user.email === SUPER_ADMIN_EMAIL) {
            showView('view-superadmin');
            showSuperAdminSection('dash');
            fetchGlobalStores();
        } else {
            // Cargar datos de la tienda del usuario y mostrar panel de administración
            await loadStoreData(data.user.id);
            showView('view-admin', 'dash');
        }
    } catch (err) {
        alert('Error al iniciar sesión: ' + err.message);
    } finally {
        if (btn) setLoading(btn, false);
    }
}

async function handleRegister(btn) {
    if (window.initSupabasePromise) await window.initSupabasePromise;
    try { requireSupabase(); } catch(e) { return alert(e.message); }

    const storeName = document.getElementById('reg-store-name').value.trim();
    const ownerName = document.getElementById('reg-owner').value.trim();
    const email     = document.getElementById('reg-email').value.trim();
    const pass      = document.getElementById('reg-pass').value;
    const storeType = document.getElementById('reg-type')?.value || 'Tienda';

    if (!storeName || !email || !pass) return alert('Completa todos los campos obligatorios.');
    if (pass.length < 6) return alert('La contraseña debe tener al menos 6 caracteres.');
    
    // Generar slug base (limpio, sin número al final)
    const slugBase = storeName.toLowerCase().trim()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar acentos
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (btn) setLoading(btn, true);
    try {
        console.log('Intentando registro para:', email);
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email, password: pass,
            options: { data: { full_name: ownerName } }
        });
        if (authError) {
            console.error('Detalle error Auth:', authError);
            throw authError;
        }

        // A veces signUp no devuelve session (confirmación por email activa).
        let session = authData?.session || null;
        let user    = authData?.user || null;
        if (!session) {
            try {
                const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({ email, password: pass });
                if (signInErr) {
                    alert('Registro realizado. Confirma tu email antes de iniciar sesión.');
                    showView('view-login');
                    return;
                }
                session = signInData?.session || null;
                user    = signInData?.user || user;
            } catch (e) {
                console.error('Error durante signInAfterSignUp:', e);
                alert('Registro completado, pero no fue posible iniciar sesión automáticamente. Revisa tu email.');
                return;
            }
        }

        if (!user || !session) throw new Error('No se pudo obtener sesión de usuario tras registro.');

        // Garantizar slug único: intentar sin sufijo primero
        let finalSlug = slugBase;
        const { data: existing } = await supabase.from('stores').select('id').eq('slug', slugBase).maybeSingle();
        if (existing) {
            // Solo agregar sufijo si hay colisión
            finalSlug = slugBase + '-' + Date.now().toString().slice(-4);
        }

        const { data: storeData, error: storeError } = await supabase
            .from('stores')
            .insert([{ 
                owner_id: user.id, 
                name:     storeName,
                slug:     finalSlug,
                type:     storeType
            }])
            .select()
            .single();

        if (storeError) {
            console.error('Detalle error Store:', storeError);
            throw storeError;
        }

        appState.session = session;
        appState.tenant  = storeData;
        alert('¡Tienda creada con éxito! Tu enlace es: ' + window.location.origin + '?store=' + finalSlug);
        if (typeof initializeAdminUI === 'function') initializeAdminUI();
        showView('view-admin', 'dash');
    } catch (err) {
        console.error('Excepción en handleRegister:', err);
        alert('Error en el registro: ' + (err.description || err.message));
    } finally {
        if (btn) setLoading(btn, false);
    }
}

async function logout() {
    if (supabase && supabase.auth) {
        await supabase.auth.signOut();
    }
    appState = { session: null, tenant: null, products: [], orders: [], cart: [] };
    localStorage.clear();
    showView('view-landing');
}

function switchAuth(view) {
    showView(view);
}

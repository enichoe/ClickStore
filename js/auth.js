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

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) console.error("Error obteniendo sesión:", sessionError);

    if (session) {
        appState.session = session;
        console.log("Sesión activa detectada para:", session.user.email);
        
        if (session.user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
            console.log("Entrando como Super Admin");
            showView('view-superadmin');
            fetchGlobalStores();
            return;
        }

        console.log("Cargando datos de tienda para user:", session.user.id);
        await loadStoreData(session.user.id);
    } else {
        console.log("No hay sesión activa, mostrando landing.");
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
            return true;
        } else {
            console.warn("No se encontró tienda para el usuario.");
            appState.tenant = null;
            return false;
        }
    } catch (err) {
        console.error("Error cargando tienda:", err);
    }
}

async function handleLogin(btn) {
    if (window.initSupabasePromise) await window.initSupabasePromise;
    try { requireSupabase(); } catch(e) { console.error(e.message); showView('view-landing'); return; }

    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-pass').value;

    if (!email || !pass) return showToast('⚠️ Completa el email y la contraseña.', 'error');

    if (btn) setLoading(btn, true);
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        appState.session = data.session;

        // Si el usuario es super admin, mostrar panel maestro
        if (data.user && data.user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
            showView('view-superadmin');
            showSuperAdminSection('dash');
            fetchGlobalStores();
        } else {
            // Limpiar estado previo antes de cargar nueva tienda
            resetAppState();
            
            // Cargar datos de la tienda del usuario y mostrar panel de administración
            const hasStore = await loadStoreData(data.user.id);
            if (hasStore) {
                showView('view-admin', 'dash');
            } else {
                showToast('⚠️ No tienes una tienda configurada.', 'error');
                showView('view-landing');
            }
        }
    } catch (err) {
        showToast('❌ Error al iniciar sesión: ' + err.message, 'error');
    } finally {
        if (btn) setLoading(btn, false);
    }
}

async function handleRegister(btn) {
    if (window.initSupabasePromise) await window.initSupabasePromise;
    try { requireSupabase(); } catch(e) { showToast('❌ Supabase no configurado.', 'error'); return; }

    const storeName = document.getElementById('reg-store-name').value.trim();
    const ownerName = document.getElementById('reg-owner').value.trim();
    const email     = document.getElementById('reg-email').value.trim();
    const pass      = document.getElementById('reg-pass').value;
    const storeType = document.getElementById('reg-type')?.value || 'Tienda';

    if (!storeName || !email || !pass) return showToast('⚠️ Completa todos los campos obligatorios.', 'error');
    if (pass.length < 6) return showToast('⚠️ La contraseña debe tener al menos 6 caracteres.', 'error');
    
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
                    showToast('📧 Registro realizado. Confirma tu email.', 'success');
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

        resetAppState();
        appState.session = session;
        appState.tenant  = storeData;
        
        alert('¡Tienda creada con éxito! Tu enlace es: ' + window.location.origin + '?store=' + finalSlug);
        
        if (typeof initializeAdminUI === 'function') initializeAdminUI();
        
        // Redirección según rol (Super Admin o Admin regular)
        if (session.user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
            showView('view-superadmin');
            if (typeof fetchGlobalStores === 'function') fetchGlobalStores();
        } else {
            showView('view-admin', 'dash');
        }
    } catch (err) {
        console.error('Excepción en handleRegister:', err);
        showToast('❌ Error en el registro: ' + (err.description || err.message), 'error');
    } finally {
        if (btn) setLoading(btn, false);
    }
}

function resetAppState() {
    console.log("Reiniciando estado de la aplicación...");
    appState.tenant = null;
    appState.products = [];
    appState.categories = [];
    appState.orders = [];
    appState.cart = [];
}

async function logout() {
    if (supabase && supabase.auth) {
        await supabase.auth.signOut();
    }
    resetAppState();
    appState.session = null;
    localStorage.clear();
    showView('view-landing');
}

function switchAuth(view) {
    showView(view);
}

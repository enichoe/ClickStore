// ======================= AUTH (SUPABASE) =======================
async function checkSession() {
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
        const { data, error } = await supabase
            .from('stores')
            .select('*')
            .or(`owner_id.eq.${identifier},slug.eq.${identifier}`)
            .single();

        if (error) throw error;
        if (data) {
            appState.tenant = data;
            if (typeof initializeAdminUI === 'function') initializeAdminUI();
        }
    } catch (err) {
        console.error("Error cargando tienda:", err);
    }
}

async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    const btn = window.event ? window.event.target : null;

    if (btn) setLoading(btn, true);
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        
        appState.session = data.session;
        
        if (data.user.email === SUPER_ADMIN_EMAIL) {
            showView('view-superadmin');
            fetchGlobalStores();
            return;
        }

        await loadStoreData(data.user.id);
    } catch (err) {
        alert("Error al iniciar sesión: " + err.message);
    } finally {
        setLoading(btn, false);
    }
}

async function handleRegister() {
    const storeName = document.getElementById('reg-store-name').value;
    const ownerName = document.getElementById('reg-owner').value;
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const btn = window.event ? window.event.target : null;

    if (!storeName || !email || !pass) return alert("Completa todos los campos");
    if (pass.length < 6) return alert("La contraseña debe tener al menos 6 caracteres.");
    
    // Generar Slug simple
    const slug = storeName.toLowerCase().trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');

    if (btn) setLoading(btn, true);
    try {
        console.log("Intentando registro para:", email);
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email, password: pass,
            options: { data: { full_name: ownerName } }
        });
        
        if (authError) {
            console.error("Detalle error Auth:", authError);
            throw authError;
        }

        if (!authData.user) {
            throw new Error("No se pudo crear el usuario. ¿Quizás ya existe?");
        }

        const { data: storeData, error: storeError } = await supabase
            .from('stores')
            .insert([{ 
                owner_id: authData.user.id, 
                name: storeName,
                slug: slug + '-' + Math.floor(Math.random() * 1000), // Evitar duplicados iniciales
                type: document.querySelector('#view-register select')?.value || 'Tienda'
            }])
            .select()
            .single();
        
        if (storeError) {
            console.error("Detalle error Store:", storeError);
            throw storeError;
        }

        appState.session = authData.session;
        appState.tenant = storeData;
        alert("¡Tienda creada con éxito!");
        if (typeof initializeAdminUI === 'function') initializeAdminUI();
        showView('view-admin', 'dash');
    } catch (err) {
        console.error("Excepción en handleRegister:", err);
        alert("Error en el registro: " + (err.description || err.message));
    } finally {
        setLoading(btn, false);
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

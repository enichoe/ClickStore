// ======================= AUTH (SUPABASE) =======================
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        appState.session = session;
        await loadStoreData(session.user.id);
        
        const lastView = localStorage.getItem('clickSaaS_lastView') || 'view-admin';
        const lastSection = localStorage.getItem('clickSaaS_lastSection') || 'dash';
        showView(lastView, lastSection);
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('store')) {
            if (typeof loadPublicStore === 'function') await loadPublicStore(urlParams.get('store'));
        } else {
            showView('view-landing');
        }
    }
}

async function loadStoreData(userId) {
    try {
        const { data, error } = await supabase
            .from('stores')
            .select('*')
            .eq('owner_id', userId)
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
    const btn = event.target;

    setLoading(btn, true);
    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        
        appState.session = data.session;
        await loadStoreData(data.user.id);
        showView('view-admin', 'dash');
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
    const btn = event.target;

    if (!storeName || !email || !pass) return alert("Completa todos los campos");

    setLoading(btn, true);
    try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email, password: pass,
            options: { data: { full_name: ownerName } }
        });
        if (authError) throw authError;

        const { data: storeData, error: storeError } = await supabase
            .from('stores')
            .insert([{ 
                owner_id: authData.user.id, 
                name: storeName,
                type: document.querySelector('#view-register select')?.value || 'Tienda'
            }])
            .select()
            .single();
        
        if (storeError) throw storeError;

        appState.session = authData.session;
        appState.tenant = storeData;
        alert("¡Tienda creada con éxito! Revisa tu email para confirmar.");
        if (typeof initializeAdminUI === 'function') initializeAdminUI();
        showView('view-admin', 'dash');
    } catch (err) {
        alert("Error en el registro: " + err.message);
    } finally {
        setLoading(btn, false);
    }
}

async function logout() {
    await supabase.auth.signOut();
    appState = { session: null, tenant: null, products: [], orders: [], cart: [] };
    localStorage.clear();
    showView('view-landing');
}

function switchAuth(view) {
    showView(view);
}

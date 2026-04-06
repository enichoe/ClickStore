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
    // Usar el slug editado por el usuario (o generarlo desde el nombre)
    const slugInput  = document.getElementById('reg-slug')?.value.trim();
    const slugBase   = slugInput && slugInput.length > 0
        ? generateSlug(slugInput)
        : generateSlug(storeName);

    if (!storeName || !email || !pass) return showToast('⚠️ Completa todos los campos obligatorios.', 'error');
    if (pass.length < 6) return showToast('⚠️ La contraseña debe tener al menos 6 caracteres.', 'error');
    if (slugBase.length < 2) return showToast('⚠️ El enlace de la tienda es muy corto. Escribe un nombre más largo.', 'error');
    if (slugBase.length > 60) return showToast('⚠️ El enlace es demasiado largo. Máximo 60 caracteres.', 'error');

    if (btn) setLoading(btn, true);
    try {
        console.log('Intentando registro para:', email);
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email, password: pass,
            options: { data: { full_name: ownerName } }
        });
        if (authError) {
            console.error('Detalle error Auth:', authError);
            // Caso especial: el email ya tiene cuenta registrada
            if (authError.message?.toLowerCase().includes('already registered') ||
                authError.message?.toLowerCase().includes('user already') ||
                authError.status === 422) {
                showToast('⚠️ Este email ya tiene una cuenta. Inicia sesión directamente.', 'warning');
                // Pre-rellenar el email en el login para facilitar el acceso
                const loginEmailInput = document.getElementById('login-email');
                if (loginEmailInput) loginEmailInput.value = email;
                showView('view-login');
                return;
            }
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
        
        showToast('🎉 ¡Tienda creada! Tu enlace: ' + window.location.origin + '?store=' + finalSlug, 'success');
        
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
        // Mensajes de error amigables según el tipo
        let userMsg = err.message || 'Error desconocido';
        if (userMsg.includes('already registered') || userMsg.includes('already exists')) {
            userMsg = 'Este email ya tiene una cuenta. Usa Iniciar Sesión.';
            showToast('⚠️ ' + userMsg, 'warning');
            showView('view-login');
        } else if (userMsg.includes('invalid email')) {
            showToast('❌ El email no es válido.', 'error');
        } else if (userMsg.includes('Password should be')) {
            showToast('❌ La contraseña debe tener al menos 6 caracteres.', 'error');
        } else {
            showToast('❌ Error en el registro: ' + userMsg, 'error');
        }
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

// ============================================================
// SLUG UTILITIES
// ============================================================

/**
 * Genera un slug limpio y URL-friendly desde cualquier texto.
 * Maneja: acentos, apóstrofes, emojis, espacios, caracteres especiales.
 * Ejemplos:
 *   "Pizza Don Luis"    → "pizza-don-luis"
 *   "Tech Store's"      → "tech-stores"
 *   "Café & Panadería"  → "cafe-panaderia"
 *   "Ropa 🔥 By Ximena" → "ropa-by-ximena"
 */
function generateSlug(text) {
    return text
        .toLowerCase()
        .trim()
        // Remover emojis y símbolos Unicode no latinos
        .replace(/[\u{1F600}-\u{1F64F}|\u{1F300}-\u{1F5FF}|\u{1F680}-\u{1F6FF}|\u{2600}-\u{26FF}|\u{2700}-\u{27BF}|\u{1F900}-\u{1F9FF}|\u{1FA00}-\u{1FA6F}]/gu, '')
        // Normalizar acentos (á→a, é→e, ñ→n, etc.)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Reemplazar ñ como caso especial (después de NFD queda como n + combining)
        .replace(/ñ/g, 'n')
        // Apóstrofes y comillas: eliminar (tech store's → tech stores, no tech-store-s)
        .replace(/['''`"]/g, '')
        // Ampersand → 'y'
        .replace(/&/g, 'y')
        // Reemplazar cualquier char que no sea a-z, 0-9 → guión
        .replace(/[^a-z0-9]+/g, '-')
        // Eliminar guiones al inicio y al final
        .replace(/^-+|-+$/g, '')
        // Máx 60 caracteres
        .slice(0, 60);
}

/**
 * Se llama en tiempo real al escribir el nombre de la tienda.
 * Sincroniza el preview y el campo slug (si el usuario no lo ha editado manualmente).
 */
function syncRegSlugFromName(storeName) {
    const slugField = document.getElementById('reg-slug');
    const slugPreview = document.getElementById('reg-slug-preview');

    const generated = generateSlug(storeName) || 'tu-tienda';

    // Solo auto-sync si el usuario no ha editado el slug manualmente
    if (slugField && !slugField.dataset.manualEdit) {
        slugField.value = generated;
    }

    // Preview siempre se actualiza
    const currentSlug = (slugField && slugField.dataset.manualEdit)
        ? (slugField.value || generated)
        : generated;

    if (slugPreview) slugPreview.textContent = currentSlug || 'tu-tienda';
    updateSlugHint(currentSlug);
}

/**
 * Limpia el input del slug en tiempo real y actualiza el preview.
 */
function sanitizeSlugInput(input) {
    // Marcar que el usuario editó manualmente
    input.dataset.manualEdit = 'true';

    // Limpiar en tiempo real: solo permitir a-z, 0-9, guiones
    const clean = generateSlug(input.value);
    input.value = clean;

    const preview = document.getElementById('reg-slug-preview');
    if (preview) preview.textContent = clean || 'tu-tienda';
    updateSlugHint(clean);
}

/**
 * Actualiza el hint debajo del campo slug con feedback visual.
 */
function updateSlugHint(slug) {
    const hint = document.getElementById('reg-slug-hint');
    if (!hint) return;
    if (!slug || slug.length < 2) {
        hint.innerHTML = '<span class="text-yellow-500">⚠️ El enlace es muy corto.</span>';
    } else if (slug.length > 50) {
        hint.innerHTML = `<span class="text-yellow-500">⚠️ Muy largo (${slug.length}/60 chars).</span>`;
    } else {
        hint.innerHTML = `<span class="text-emerald-500">✓ Enlace válido · ${slug.length} caracteres</span>`;
    }
}


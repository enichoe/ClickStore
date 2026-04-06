/**
 * js/order-handler-secure.js
 * ============================================================
 * Manejador SEGURO de órdenes para producción
 * - Integra validación de cliente
 * - Rate limiting
 * - Llamadas RPC seguras
 * - Manejo de errores robusto
 * ============================================================
 */

/**
 * Crear orden con todas las validaciones de seguridad
 */
async function createOrderSecure(storeId, cart, customerName, whatsapp) {
  try {
    // 0. RATE LIMITING LOCAL
    const endpoint = `create-order:${storeId}`;
    if (!localRateLimit.canMakeRequest(endpoint, 5, 60)) {
      const waitTime = localRateLimit.getWaitTime(endpoint, 60);
      const errorMsg = `Too many orders. Please wait ${waitTime} seconds.`;
      showToast(`⏱️ ${errorMsg}`, 'warning');
      return { success: false, error: errorMsg };
    }

    // 1. VALIDACIÓN DE CLIENTE
    console.log('🔍 Validating order data...');
    let validationErrors = [];

    // Validar carrito
    validationErrors = validationErrors.concat(orderValidator.validateCart(cart));

    // Validar cliente
    validationErrors = validationErrors.concat(
      orderValidator.validateCustomer(customerName, whatsapp)
    );

    // Calcular total
    const computedTotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

    // Validar total
    validationErrors = validationErrors.concat(
      orderValidator.validateTotal(computedTotal)
    );

    // Validar store_id
    if (!orderValidator.isValidUUID(storeId)) {
      validationErrors.push('Invalid store ID');
    }

    // Si hay errores, retornar
    if (validationErrors.length > 0) {
      const errorHandler = securityErrorHandler.handleValidationError(
        validationErrors,
        { storeId, itemsCount: cart.length }
      );
      showToast(`❌ ${errorHandler.userMessage}`, 'error');
      return { success: false, error: errorHandler.userMessage };
    }

    // 2. PREPARAR PAYLOAD
    const orderPayload = {
      p_store_id: storeId,
      p_customer_name: orderValidator.sanitizeString(customerName),
      p_whatsapp: whatsapp.trim(),
      p_items: cart.map((item) => ({
        id: item.id,
        qty: item.qty
      }))
    };

    // 3. DETECTAR ANOMALÍAS
    const anomaly = securityErrorHandler.detectAnomaly();
    if (anomaly.hasAnomaly) {
      securityErrorHandler.logSuspiciousActivity('possible_attack', {
        anomaly,
        storeId
      });
      showToast('🚨 System detected suspicious activity. Please try again later.', 'error');
      return {
        success: false,
        error: 'Security check failed'
      };
    }

    // 4. LLAMAR RPC SEGURA
    console.log('📤 Calling secure order creation function...');
    setLoading('btn-checkout', true);

    const { data, error } = await supabase.rpc('create_order_secure', orderPayload);

    if (error) {
      const errorHandler = securityErrorHandler.handleSupabaseError(error, {
        storeId,
        itemsCount: cart.length
      });

      console.error('Supabase RPC Error:', error);
      showToast(`❌ ${errorHandler.userMessage}`, 'error');

      // Log de actividad sospechosa si es error de autorización
      if (errorHandler.isSecurityError) {
        securityErrorHandler.logSuspiciousActivity('unauthorized_order_attempt', {
          storeId,
          error: error.message
        });
      }

      return {
        success: false,
        error: errorHandler.userMessage,
        shouldRetry: errorHandler.shouldRetry
      };
    }

    // 5. VALIDAR RESPUESTA
    if (!data || !data.success) {
      const errorMsg = data?.error || 'Failed to create order (Unknown error)';
      showToast(`❌ ${errorMsg}`, 'error');
      return { success: false, error: errorMsg };
    }

    // 6. ÉXITO
    console.log('✅ Order created:', data.order_id);
    showToast(
      `✅ Orden creada exitosamente (ID: ${data.order_id.slice(0, 8)})`,
      'success'
    );

    return {
      success: true,
      orderId: data.order_id,
      total: data.total
    };
  } catch (unexpectedError) {
    console.error('❌ Unexpected error in createOrderSecure:', unexpectedError);
    securityErrorHandler.logError({
      type: 'unexpected_error',
      message: unexpectedError.message,
      stack: unexpectedError.stack,
      timestamp: new Date()
    });

    showToast('❌ An unexpected error occurred. Please try again.', 'error');
    return { success: false, error: 'Unexpected error' };
  } finally {
    setLoading('btn-checkout', false);
  }
}

/**
 * Actualizar estado de orden (solo admin)
 */
async function updateOrderStatusSecure(orderId, newStatus) {
  try {
    // Validar UUID
    if (!orderValidator.isValidUUID(orderId)) {
      showToast('❌ Invalid order ID', 'error');
      return { success: false };
    }

    // Validar status
    const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
      showToast(`❌ Invalid status. Allowed: ${validStatuses.join(', ')}`, 'error');
      return { success: false };
    }

    // Rate limit
    const endpoint = `update-order:${orderId}`;
    if (!localRateLimit.canMakeRequest(endpoint, 10, 60)) {
      showToast('⏱️ Too many updates. Please wait.', 'warning');
      return { success: false };
    }

    // Llamar función segura
    const { data, error } = await supabase.rpc('update_order_status', {
      p_order_id: orderId,
      p_new_status: newStatus
    });

    if (error) {
      const handler = securityErrorHandler.handleSupabaseError(error, {
        orderId,
        newStatus
      });
      showToast(`❌ ${handler.userMessage}`, 'error');
      return { success: false };
    }

    showToast('✅ Order status updated', 'success');
    return { success: true, data };
  } catch (error) {
    console.error('Error updating order status:', error);
    securityErrorHandler.logError({
      type: 'update_order_error',
      message: error.message,
      orderId,
      timestamp: new Date()
    });
    showToast('❌ Failed to update order status', 'error');
    return { success: false };
  }
}

/**
 * Obtener órdenes de tienda con validaciones
 */
async function fetchStoreOrdersSecure(storeId, filters = {}) {
  try {
    // Validar store_id
    if (!orderValidator.isValidUUID(storeId)) {
      throw new Error('Invalid store ID');
    }

    const { limit = 50, offset = 0, status = null } = filters;

    // Rate limit
    if (!localRateLimit.canMakeRequest(`fetch-orders:${storeId}`, 20, 60)) {
      throw new Error('Rate limit exceeded');
    }

    // Llamar función segura
    const { data, error } = await supabase.rpc('get_store_orders_summary', {
      p_store_id: storeId,
      p_limit: Math.min(limit, 500), // Cap at 500
      p_offset: Math.max(offset, 0),
      p_status: status
    });

    if (error) {
      throw error;
    }

    if (!data || !data.success) {
      throw new Error(data?.error || 'Failed to fetch orders');
    }

    return {
      success: true,
      orders: data.orders,
      pagination: data.pagination
    };
  } catch (error) {
    console.error('Error fetching orders:', error);
    securityErrorHandler.handleSupabaseError(error, { storeId, filters });
    return { success: false, error: error.message };
  }
}

/**
 * Subir imagen con validaciones de seguridad
 */
async function uploadProductImageSecure(file, storeId, productId) {
  try {
    // 1. VALIDAR ARCHIVO
    console.log('🔍 Validating image file...');

    const optimizer = new ImageOptimizer();
    optimizer.validateFile(file);

    // Verificar que estemos en el contexto correcto
    if (!orderValidator.isValidUUID(storeId)) {
      throw new Error('Invalid store ID');
    }

    if (!orderValidator.isValidUUID(productId)) {
      throw new Error('Invalid product ID');
    }

    // 2. OPTIMIZAR IMAGEN
    console.log('🖼️  Optimizing image...');
    const variants = await optimizer.generateVariants(file);
    const hash = await optimizer.calculateHash(variants.full);
    const timestamp = Date.now();

    // 3. PREPARAR RUTAS
    const paths = {
      full: `stores/${storeId}/products/full/${hash}_${timestamp}.webp`,
      preview: `stores/${storeId}/products/preview/${hash}_${timestamp}.webp`,
      thumbnail: `stores/${storeId}/products/thumbnails/${hash}_${timestamp}.webp`
    };

    // 4. RATE LIMITING
    if (!localRateLimit.canMakeRequest(`upload-image:${storeId}`, 20, 3600)) {
      throw new Error('Too many image uploads. Please try again later.');
    }

    // 5. SUBIR EN PARALELO
    console.log('📤 Uploading image variants...');
    const uploadPromises = Object.entries(variants).map(([type, blob]) =>
      supabase.storage.from('product-images').upload(paths[type], blob, {
        upsert: false
      })
    );

    const uploadResults = await Promise.all(uploadPromises);

    // Verificar errores
    const uploadErrors = uploadResults.filter((r) => r.error);
    if (uploadErrors.length > 0) {
      throw new Error(`Upload failed: ${uploadErrors[0].error.message}`);
    }

    // 6. RETORNAR INFORMACIÓN
    console.log('✅ Image uploaded successfully');
    return {
      success: true,
      hash,
      paths,
      sizes: {
        full: variants.full.size,
        preview: variants.preview.size,
        thumbnail: variants.thumbnail.size
      }
    };
  } catch (error) {
    console.error('❌ Image upload error:', error);
    securityErrorHandler.logError({
      type: 'image_upload_error',
      message: error.message,
      storeId,
      timestamp: new Date()
    });

    showToast(`❌ ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

/**
 * Manejar respuesta de checkout (después de pago)
 */
async function handleCheckoutResponse(orderId, paymentStatus) {
  try {
    if (!orderValidator.isValidUUID(orderId)) {
      throw new Error('Invalid order ID');
    }

    if (!['success', 'failed', 'pending'].includes(paymentStatus)) {
      throw new Error('Invalid payment status');
    }

    // Actualizar el estado de la orden según pago
    let newOrderStatus = 'pending';
    if (paymentStatus === 'success') {
      newOrderStatus = 'confirmed';
    }

    const result = await updateOrderStatusSecure(orderId, newOrderStatus);

    if (result.success) {
      showToast(
        '✅ Order confirmed! You will receive a WhatsApp notification soon.',
        'success'
      );
    }

    return result;
  } catch (error) {
    console.error('Error handling checkout response:', error);
    securityErrorHandler.logError({
      type: 'checkout_error',
      message: error.message,
      orderId,
      timestamp: new Date()
    });
    return { success: false };
  }
}

/**
 * Limpiar datos sensibles después de crear orden
 */
function clearSensitiveData() {
  // Limpiar carrito inmediatamente
  appState.cart = [];

  // Limpiar formulario
  const formInputs = ['customer-name', 'whatsapp', 'delivery-address'];
  formInputs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Flush error logs
  if (securityErrorHandler) {
    securityErrorHandler.flushErrorLog();
  }

  console.log('🧹 Sensitive data cleared');
}

// ============================================================
// INTEGRACIÓN CON EVENTO GLOBAL DE CHECKOUT (versión RPC pura)
// NOTA: La función principal handleCheckout() vive en storefront.js
// Esta versión alternativa es para uso directo por RPC sin WhatsApp form
// ============================================================

async function handleCheckoutSecureRPC() {
  const storeId = appState.tenant?.id;
  if (!storeId) { showToast('❌ No hay tienda activa', 'error'); return; }
  
  const cart = appState.cart;
  const customerName = document.getElementById('customer-name')?.value;
  const whatsapp = document.getElementById('whatsapp')?.value;

  const result = await createOrderSecure(storeId, cart, customerName, whatsapp);

  if (result.success) {
    // Éxito: limpiar datos
    clearSensitiveData();

    // Mostrar confirmación
    const modal = document.getElementById('modal-order-success');
    if (modal) {
      const orderIdEl = document.getElementById('order-id');
      const orderTotalEl = document.getElementById('order-total');
      if (orderIdEl) orderIdEl.textContent = result.orderId?.slice(0, 8) || '';
      if (orderTotalEl) orderTotalEl.textContent = `S/. ${(result.total || 0).toFixed(2)}`;
      modal.style.display = 'flex';
    }

    return result;
  } else {
    // Error: no limpiar, permitir reintentar
    if (result.shouldRetry) {
      showToast('🔄 Rate limit exceeded, please try again in a moment', 'warning');
    }

    return result;
  }
}

// ============================================================
// EXPORTAR FUNCIONES
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createOrderSecure,
    updateOrderStatusSecure,
    fetchStoreOrdersSecure,
    uploadProductImageSecure,
    handleCheckoutResponse,
    clearSensitiveData,
    handleCheckout
  };
}

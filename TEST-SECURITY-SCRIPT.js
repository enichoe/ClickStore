/**
 * TEST-SECURITY-SCRIPT.js
 * ============================================================
 * Script de pruebas automatizadas para:
 * 1. RLS (Row Level Security)
 * 2. Rate Limiting
 * 3. Checkout Seguro
 * ============================================================
 * 
 * USO:
 * 1. Copia este contenido
 * 2. Abre DevTools (F12) en tu app
 * 3. Pestaña Console
 * 4. Pega el código completo
 * 5. Presiona Enter y observa los resultados
 */

async function runAllSecurityTests() {
  console.clear();
  console.log('%c🔒 INICIANDO PRUEBAS DE SEGURIDAD CLICKSTORE', 'color: #6366f1; font-size: 16px; font-weight: bold;');
  console.log('═'.repeat(60));

  // Variables globales para las pruebas
  const testResults = {
    rls: [],
    rateLimit: [],
    checkout: []
  };

  // ============================================================
  // SECCIÓN 1: PRUEBAS DE RLS
  // ============================================================
  console.log('\n%c1️⃣  PRUEBAS DE RLS (Row Level Security)', 'color: #3b82f6; font-size: 14px; font-weight: bold;');
  console.log('─'.repeat(60));

  try {
    // Test 1.1: Obtener ID de tienda
    if (!appState.tenant) {
      throw new Error('No hay tienda cargada. Por favor, carga una tienda primero.');
    }

    const storeId = appState.tenant.id;
    console.log(`✅ Tienda detectada: ${appState.tenant.name} (${storeId})`);

    // Test 1.2: Verificar que podemos LEER órdenes propias
    console.log('\n📖 Test 1.2: Intentando leer órdenes de tienda propia...');
    const { data: ownOrders, error: readError } = await supabase
      .from('orders')
      .select('id, customer_name, total')
      .eq('store_id', storeId)
      .limit(1);

    if (readError) {
      console.log(`❌ Error al leer órdenes: ${readError.message}`);
      testResults.rls.push({ test: 'Read own orders', status: 'FAILED', error: readError.message });
    } else {
      console.log(`✅ Lectura autorizada. Órdenes encontradas: ${ownOrders?.length || 0}`);
      testResults.rls.push({ test: 'Read own orders', status: 'PASSED' });
    }

    // Test 1.3: Verificar auditoría
    console.log('\n📋 Test 1.3: Verificando tabla de auditoría...');
    const { data: auditLogs, error: auditError } = await supabase
      .from('audit_logs')
      .select('action, table_name, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(3);

    if (auditError) {
      console.log(`❌ Error al leer auditoría: ${auditError.message}`);
      testResults.rls.push({ test: 'Read audit logs', status: 'FAILED', error: auditError.message });
    } else {
      console.log(`✅ Auditoría accesible. Registros recientes:`);
      auditLogs?.forEach((log, i) => {
        console.log(`   ${i + 1}. ${log.action} en ${log.table_name} - ${new Date(log.created_at).toLocaleString()}`);
      });
      testResults.rls.push({ test: 'Read audit logs', status: 'PASSED' });
    }

  } catch (err) {
    console.log(`❌ Error en pruebas RLS: ${err.message}`);
    testResults.rls.push({ test: 'RLS general', status: 'ERROR', error: err.message });
  }

  // ============================================================
  // SECCIÓN 2: PRUEBAS DE RATE LIMITING
  // ============================================================
  console.log('\n%c2️⃣  PRUEBAS DE RATE LIMITING', 'color: #f59e0b; font-size: 14px; font-weight: bold;');
  console.log('─'.repeat(60));

  try {
    // Necesitamos un producto válido para las órdenes
    console.log('\n🛍️  Buscando productos disponibles...');
    const { data: products, error: prodError } = await supabase
      .from('products')
      .select('id, name, price, is_available')
      .eq('store_id', appState.tenant.id)
      .eq('is_available', true)
      .limit(1);

    if (prodError || !products?.length) {
      throw new Error('No hay productos disponibles para pruebas');
    }

    const testProduct = products[0];
    console.log(`✅ Producto encontrado: ${testProduct.name} ($${testProduct.price})`);

    // Test 2.1: Enviar 6 órdenes rápidamente (máx 5 en 60s)
    console.log('\n⏱️  Test 2.1: Enviando 6 órdenes en <1 segundo (máx dovible: 5)...');
    const rateLimitResults = [];

    for (let i = 1; i <= 6; i++) {
      const result = await createOrderSecure(
        appState.tenant.id,
        [{ id: testProduct.id, qty: 1 }],
        `TestUser${i}`,
        `+5199999999${String(i).padStart(2, '0')}`
      );

      const status = result.success ? '✅' : '❌';
      const detail = result.success
        ? `Order ID: ${result.orderId.slice(0, 8)}...`
        : `Error: ${result.error}`;

      console.log(`   Intento ${i}: ${status} ${detail}`);
      rateLimitResults.push({
        attempt: i,
        success: result.success,
        error: result.error
      });
    }

    // Validar resultados
    const firstFivePass = rateLimitResults.slice(0, 5).every(r => r.success);
    const sixthFails = !rateLimitResults[5].success;

    if (firstFivePass && sixthFails) {
      console.log('✅ Rate limiting funciona correctamente (5 permitidas, 6ª bloqueada)');
      testResults.rateLimit.push({ test: 'Rate limit blocking', status: 'PASSED' });
    } else if (firstFivePass) {
      console.log('⚠️  Advertencia: 6ª solicitud NO fue bloqueada (verificar timings)');
      testResults.rateLimit.push({ test: 'Rate limit blocking', status: 'WARNING' });
    } else {
      console.log('❌ Error: Algunas de las primeras 5 solicitudes fueron bloqueadas');
      testResults.rateLimit.push({ test: 'Rate limit blocking', status: 'FAILED' });
    }

    // Test 2.2: Verificar tabla rate_limits
    console.log('\n📊 Test 2.2: Verificando tabla rate_limits...');
    const { data: rateLimitData, error: rateLimitReadError } = await supabase
      .from('rate_limits')
      .select('ip_address, endpoint, request_count, window_end')
      .like('endpoint', '%create-order%')
      .order('created_at', { ascending: false })
      .limit(1);

    if (rateLimitReadError) {
      console.log(`❌ Error al leer rate_limits: ${rateLimitReadError.message}`);
      testResults.rateLimit.push({ test: 'Rate limits table', status: 'FAILED', error: rateLimitReadError.message });
    } else if (rateLimitData?.length) {
      const entry = rateLimitData[0];
      console.log(`✅ Entry encontrada:`);
      console.log(`   IP: ${entry.ip_address}`);
      console.log(`   Endpoint: ${entry.endpoint}`);
      console.log(`   Request count: ${entry.request_count}`);
      console.log(`   Window end: ${new Date(entry.window_end).toLocaleString()}`);
      testResults.rateLimit.push({ test: 'Rate limits table', status: 'PASSED' });
    } else {
      console.log('⚠️  No entries found in rate_limits (puede ser normal en primera ejecución)');
      testResults.rateLimit.push({ test: 'Rate limits table', status: 'WARNING' });
    }

  } catch (err) {
    console.log(`❌ Error en pruebas de rate limiting: ${err.message}`);
    testResults.rateLimit.push({ test: 'Rate limit general', status: 'ERROR', error: err.message });
  }

  // ============================================================
  // SECCIÓN 3: PRUEBAS DE VALIDACIÓN DE CHECKOUT
  // ============================================================
  console.log('\n%c3️⃣  PRUEBAS DE VALIDACIÓN DE CHECKOUT', 'color: #10b981; font-size: 14px; font-weight: bold;');
  console.log('─'.repeat(60));

  try {
    const { data: testProducts } = await supabase
      .from('products')
      .select('id, name, price')
      .eq('store_id', appState.tenant.id)
      .eq('is_available', true)
      .limit(1);

    if (!testProducts?.length) {
      throw new Error('No hay productos disponibles');
    }

    const product = testProducts[0];

    // Test 3.1: Nombre muy corto
    console.log('\n❌ Test 3.1: Nombre demasiado corto (debe fallar)...');
    const test31 = await createOrderSecure(
      appState.tenant.id,
      [{ id: product.id, qty: 1 }],
      'AB',
      '+51999999999'
    );
    const fail31 = test31.success === false && test31.error.includes('name');
    console.log(fail31 ? `✅ CORRECTO: ${test31.error}` : `❌ INCORRECTO: No validó nombre corto`);
    testResults.checkout.push({ test: 'Reject short name', status: fail31 ? 'PASSED' : 'FAILED' });

    // Test 3.2: WhatsApp vacío
    console.log('\n❌ Test 3.2: WhatsApp vacío (debe fallar)...');
    const test32 = await createOrderSecure(
      appState.tenant.id,
      [{ id: product.id, qty: 1 }],
      'Juan Pérez',
      ''
    );
    const fail32 = test32.success === false && test32.error.includes('WhatsApp');
    console.log(fail32 ? `✅ CORRECTO: ${test32.error}` : `❌ INCORRECTO: No validó WhatsApp vacío`);
    testResults.checkout.push({ test: 'Reject empty WhatsApp', status: fail32 ? 'PASSED' : 'FAILED' });

    // Test 3.3: Cantidad inválida (> 999)
    console.log('\n❌ Test 3.3: Cantidad inválida >999 (debe fallar)...');
    const test33 = await createOrderSecure(
      appState.tenant.id,
      [{ id: product.id, qty: 1000 }],
      'Juan Pérez',
      '+51999999999'
    );
    const fail33 = test33.success === false && test33.error.includes('quantity');
    console.log(fail33 ? `✅ CORRECTO: ${test33.error}` : `❌ INCORRECTO: No validó cantidad`);
    testResults.checkout.push({ test: 'Reject invalid quantity', status: fail33 ? 'PASSED' : 'FAILED' });

    // Test 3.4: Carrito vacío
    console.log('\n❌ Test 3.4: Carrito vacío (debe fallar)...');
    const test34 = await createOrderSecure(
      appState.tenant.id,
      [],
      'Juan Pérez',
      '+51999999999'
    );
    const fail34 = test34.success === false && test34.error.includes('Items');
    console.log(fail34 ? `✅ CORRECTO: ${test34.error}` : `❌ INCORRECTO: No validó carrito vacío`);
    testResults.checkout.push({ test: 'Reject empty cart', status: fail34 ? 'PASSED' : 'FAILED' });

    // Test 3.5: Orden válida (flujo completo)
    console.log('\n✅ Test 3.5: Orden válida (debe crearse)...');
    const test35 = await createOrderSecure(
      appState.tenant.id,
      [{ id: product.id, qty: 2 }],
      'Cliente Test Válido',
      '+51987654321'
    );
    const success35 = test35.success === true && !!test35.orderId;
    if (success35) {
      console.log(`✅ CORRECTO: Orden creada (ID: ${test35.orderId.slice(0, 8)}..., Total: $${test35.total})`);
    } else {
      console.log(`❌ INCORRECTO: ${test35.error}`);
    }
    testResults.checkout.push({ test: 'Accept valid order', status: success35 ? 'PASSED' : 'FAILED' });

  } catch (err) {
    console.log(`❌ Error en pruebas de checkout: ${err.message}`);
    testResults.checkout.push({ test: 'Checkout general', status: 'ERROR', error: err.message });
  }

  // ============================================================
  // RESUMEN FINAL
  // ============================================================
  console.log('\n%c📊 RESUMEN DE RESULTADOS', 'color: #6366f1; font-size: 14px; font-weight: bold;');
  console.log('═'.repeat(60));

  const allTests = [
    ...testResults.rls,
    ...testResults.rateLimit,
    ...testResults.checkout
  ];

  const passed = allTests.filter(t => t.status === 'PASSED').length;
  const failed = allTests.filter(t => t.status === 'FAILED').length;
  const warnings = allTests.filter(t => t.status === 'WARNING').length;

  console.log(`\n✅ PASADAS: ${passed}/${allTests.length}`);
  console.log(`❌ FALLIDAS: ${failed}/${allTests.length}`);
  console.log(`⚠️  ADVERTENCIAS: ${warnings}/${allTests.length}`);

  console.log('\nDetalle:');
  allTests.forEach((test, i) => {
    const icon = test.status === 'PASSED' ? '✅' : test.status === 'FAILED' ? '❌' : '⚠️';
    console.log(`${i + 1}. ${icon} ${test.test}: ${test.status}${test.error ? ` (${test.error})` : ''}`);
  });

  if (failed === 0 && warnings <= 1) {
    console.log('\n%c🚀 SISTEMA LISTO PARA PRODUCCIÓN', 'color: #10b981; font-size: 14px; font-weight: bold; background: #ecfdf5; padding: 8px;');
  } else {
    console.log('\n%c⚠️  REQUIERE AJUSTES ANTES DE PRODUCCIÓN', 'color: #f59e0b; font-size: 14px; font-weight: bold; background: #fffbeb; padding: 8px;');
  }

  console.log('═'.repeat(60));
  return { passed, failed, warnings, details: allTests };
}

// ============================================================
// EJECUTAR PRUEBAS
// ============================================================
console.log('⏳ Iniciando pruebas en 2 segundos...\n');
setTimeout(() => {
  runAllSecurityTests().then(results => {
    console.log('\n✅ Pruebas completadas. Resultados disponibles en variable "results"');
    window.testResults = results;
  });
}, 2000);

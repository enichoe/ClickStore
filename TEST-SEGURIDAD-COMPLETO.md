# 🧪 PRUEBAS DE SEGURIDAD - ClickStore

## 1. PRUEBA DE RLS (Row Level Security)

### Objetivo
Verificar que cada usuario SOLO pueda ver y modificar sus propios registros.

### Test 1.1: Crear orden como cliente anónimo
```javascript
// En la consola del navegador
const storeId = 'TU_STORE_ID_AQUI'; // Reemplazar con ID real
const cartItems = [
  { id: 'PRODUCT_ID_1', qty: 2 }
];

const result = await createOrderSecure(
  storeId,
  cartItems,
  'Juan Pérez',
  '+51987654321'
);

console.log('✅ Orden creada:', result);
```

**Resultado esperado:**
- ✅ `success: true`
- ✅ `order_id` generado
- ✅ `total` calculado server-side

---

### Test 1.2: Verificar que User A NO ve orden de User B
```sql
-- En Supabase SQL Editor (como USER A)
SELECT * FROM orders WHERE store_id = 'STORE_ID_B';
```

**Resultado esperado:**
- ❌ ERROR: `new row violates row level security policy`
- ❌ O queryset vacío (sin acceso a órdenes de otra tienda)

---

### Test 1.3: Verificar auditoría registrada
```sql
-- Como propietario de tienda, ejecutar:
SELECT * FROM audit_logs 
WHERE store_id = 'TU_STORE_ID'
ORDER BY created_at DESC 
LIMIT 5;
```

**Resultado esperado:**
- ✅ Registro de creación de orden visible
- ✅ Campos `customer_name`, `total`, `items_count` en `new_values`

---

## 2. PRUEBA DE RATE LIMITING

### Objetivo
Bloquear más de 5 órdenes en 60 segundos desde el mismo cliente.

### Test 2.1: Intentar crear 6 órdenes rápidamente
```javascript
// En la consola del navegador
const storeId = 'TU_STORE_ID';

for (let i = 0; i < 6; i++) {
  console.log(`Intento ${i + 1}...`);
  
  const result = await createOrderSecure(
    storeId,
    [{ id: 'PRODUCT_ID', qty: 1 }],
    `Cliente ${i}`,
    `+5199999999${i}`
  );
  
  console.log(`Intento ${i + 1}:`, result.success ? '✅' : '❌', result.error || result.order_id);
  
  // Esperar 100ms entre intentos
  await new Promise(r => setTimeout(r, 100));
}
```

**Resultado esperado:**
- ✅ Intentos 1-5: `success: true`
- ❌ Intento 6: `success: false, error: "Too many orders..."`
- ⏱️ Restablecimiento después de 60 segundos

---

### Test 2.2: Verificar tabla rate_limits
```sql
-- Ver intentos registrados
SELECT ip_address, endpoint, request_count, window_end 
FROM rate_limits 
WHERE endpoint LIKE '%create-order%'
ORDER BY window_end DESC;
```

**Resultado esperado:**
- ✅ 1 entrada por `ip_address` + `endpoint`
- ✅ `request_count`: 5 o 6
- ✅ `window_end`: timestamp futuro (60 segundos desde ahora)

---

## 3. PRUEBA DE CHECKOUT SEGURO

### Objetivo
Verificar que `createOrderSecure()` ejecuta todas las validaciones.

### Test 3.1: Validación de cliente (nombre muy corto)
```javascript
const result = await createOrderSecure(
  'STORE_ID',
  [{ id: 'PROD_ID', qty: 1 }],
  'AB', // ❌ Menos de 3 caracteres
  '+51987654321'
);

console.log(result);
// Esperado: { success: false, error: "Customer name must be at least 3 characters" }
```

---

### Test 3.2: Validación de carrito vacío
```javascript
const result = await createOrderSecure(
  'STORE_ID',
  [], // ❌ Carrito vacío
  'Juan Pérez',
  '+51987654321'
);

console.log(result);
// Esperado: { success: false, error: "..." }
```

---

### Test 3.3: Validación de producto no disponible
```javascript
const result = await createOrderSecure(
  'STORE_ID',
  [{ id: 'INVALID_PRODUCT_ID', qty: 1 }], // ❌ Producto no existe
  'Juan Pérez',
  '+51987654321'
);

console.log(result);
// Esperado: { success: false, error: "Product not found..." }
```

---

### Test 3.4: Validación de cantidad inválida
```javascript
const result = await createOrderSecure(
  'STORE_ID',
  [{ id: 'VALID_PRODUCT_ID', qty: 1000 }], // ❌ Cantidad > 999
  'Juan Pérez',
  '+51987654321'
);

console.log(result);
// Esperado: { success: false, error: "Invalid quantity..." }
```

---

### Test 3.5: Validación de total excesivo
```javascript
const result = await createOrderSecure(
  'STORE_ID',
  [{ id: 'EXPENSIVE_PRODUCT', qty: 100000 }], // ❌ Total > 999,999.99
  'Juan Pérez',
  '+51987654321'
);

console.log(result);
// Esperado: { success: false, error: "Order total exceeds maximum..." }
```

---

### Test 3.6: Orden válida (flujo completo)
```javascript
// Primero obtener un producto real
const { data: products } = await supabase
  .from('products')
  .select('id, price, is_available')
  .eq('is_available', true)
  .limit(1);

if (!products?.length) {
  console.log('❌ No hay productos disponibles');
} else {
  const product = products[0];
  const result = await createOrderSecure(
    'STORE_ID',
    [{ id: product.id, qty: 2 }],
    'Cliente Test',
    '+51999999999'
  );
  
  console.log('✅ Orden creada:', {
    success: result.success,
    orderId: result.orderId,
    total: result.total
  });
}
```

---

## 4. RESUMEN DE ESTADO

| Prueba | Estado | Detalles |
|--------|--------|----------|
| RLS - User A ve su tienda | ❓ | Pendiente |
| RLS - User A NO ve tienda B | ❓ | Pendiente |
| RLS - Auditoría registra eventos | ❓ | Pendiente |
| Rate Limit - Bloquea en intento 6 | ❓ | Pendiente |
| Rate Limit - Se restablece en 60s | ❓ | Pendiente |
| Validación - Nombre corto rechazado | ❓ | Pendiente |
| Validación - Carrito vacío rechazado | ❓ | Pendiente |
| Validación - Producto inválido rechazado | ❓ | Pendiente |
| Validación - Cantidad inválida rechazada | ❓ | Pendiente |
| Validación - Total excesivo rechazado | ❓ | Pendiente |
| Validación - Orden válida creada | ❓ | Pendiente |

---

## 5. CÓMO EJECUTAR LAS PRUEBAS

### Opción A: Consola del Navegador
1. Abre tu app en `http://localhost:3000` (o tu URL)
2. Presiona `F12` para abrir DevTools
3. Ve a la pestaña **Console**
4. Copia y pega cada test uno por uno
5. Observa los resultados

### Opción B: Automatizado (Script)
Crea un archivo `test-security.js` y ejecuta:
```javascript
// Ver archivo TEST-SECURITY-SCRIPT.js
```

---

## 6. CHECKLIST FINAL

- [ ] RLS Test 1.1: Orden anónima creada ✅
- [ ] RLS Test 1.2: User A NO puede ver tienda B ✅
- [ ] RLS Test 1.3: Auditoría registra creación ✅
- [ ] Rate Limit Test 2.1: Intento 6 bloqueado ✅
- [ ] Rate Limit Test 2.2: Tabla actualizándose ✅
- [ ] Checkout Test 3.1-3.6: Todas validaciones pasan ✅

**Una vez todos los tests pasen → SISTEMA LISTO PARA PRODUCCIÓN** 🚀

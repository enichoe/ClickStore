const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { spawn } = require('child_process');

const OUT_ENV_PATH = path.join(__dirname, '..', 'js', 'env.js');

// Read required env vars
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE; // service_role key for admin operations
const SUPABASE_ANON = process.env.SUPABASE_ANON; // anon key for client

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !SUPABASE_ANON) {
  console.warn('Skipping Supabase E2E tests: missing SUPABASE_URL, SUPABASE_SERVICE_ROLE or SUPABASE_ANON env vars');
}

let serverProc = null;
let adminClient = null;
let created = { user: null, store: null, product: null, order: null };

async function waitForPort(url, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(url);
      if (res.status === 200) return true;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !SUPABASE_ANON) return;

  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false }
  });

  // Start static server
  serverProc = spawn('npx', ['serve', '.', '-l', '3000'], { shell: true, stdio: 'ignore' });

  // wait for server ready
  const ok = await waitForPort('http://localhost:3000');
  if (!ok) throw new Error('Local server did not start');

  // create test user
  const random = Date.now();
  const email = `test+${random}@example.com`;
  const password = 'Test1234!';

  const { data: userData, error: createUserErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (createUserErr) throw createUserErr;
  created.user = userData.user;

  // insert store
  const slug = `test-store-${random}`;
  const { data: storeData, error: storeErr } = await adminClient.from('stores').insert([{
    owner_id: created.user.id,
    name: 'Test Store',
    slug,
    type: 'Test'
  }]).select().single();
  if (storeErr) throw storeErr;
  created.store = storeData;

  // insert product
  const { data: prodData, error: prodErr } = await adminClient.from('products').insert([{
    store_id: created.store.id,
    name: 'Test Product E2E',
    price: 12.5,
    image: ''
  }]).select().single();
  if (prodErr) throw prodErr;
  created.product = prodData;

  // write env.js for client to use anon key
  const envContent = `window.__env = ${JSON.stringify({ SUPABASE_URL, SUPABASE_KEY: SUPABASE_ANON, SUPER_ADMIN_EMAIL: '', DEV_MODE: false }, null, 2)};`;
  fs.writeFileSync(OUT_ENV_PATH, envContent, 'utf8');
});

test.afterAll(async () => {
  if (adminClient && created.order) {
    await adminClient.from('orders').delete().eq('id', created.order.id);
  }
  if (adminClient && created.product) {
    await adminClient.from('products').delete().eq('id', created.product.id);
  }
  if (adminClient && created.store) {
    await adminClient.from('stores').delete().eq('id', created.store.id);
  }
  if (adminClient && created.user) {
    try {
      await adminClient.auth.admin.deleteUser(created.user.id);
    } catch (e) {
      console.warn('Error deleting user:', e.message || e);
    }
  }

  // remove generated env.js
  try { fs.unlinkSync(OUT_ENV_PATH); } catch (e) {}

  if (serverProc) {
    serverProc.kill();
  }
});

// Actual test that uses the created store
test('full flow: storefront add to cart and create order', async ({ page }) => {
  test.skip(!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !SUPABASE_ANON, 'Supabase credentials not provided');

  // Override window.open to prevent leaving test
  await page.addInitScript(() => {
    window.open = function() { return null; };
  });

  // Try to (re)load Supabase UMD script in page context to ensure window.supabase is present
  try {
    await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js' });
    await page.waitForFunction(() => !!window.supabase && typeof window.supabase.createClient === 'function', { timeout: 5000 });
    console.log('Injected supabase UMD script successfully');
  } catch (e) {
    console.warn('Could not inject supabase UMD script:', e.message || e);
  }
  // Call manual initializer in config.js to ensure the app's `supabase` variable is set
  try {
    const initResult = await page.evaluate(() => {
      if (window.initSupabaseNow) {
        try {
          return !!window.initSupabaseNow();
        } catch (e) { return 'error:' + (e.message || e); }
      }
      return 'no-init-fn';
    });
    console.log('initSupabaseNow result:', initResult);
  } catch (e) {
    console.warn('Error calling initSupabaseNow:', e.message || e);
  }
  // Inspect potential globals to see what the UMD exposed
  try {
    const globals = await page.evaluate(() => {
      const out = [];
      for (const k in window) {
        try {
          const v = window[k];
          if (k.toLowerCase().includes('supabase') || k.toLowerCase().includes('supabasejs') || k.toLowerCase().includes('createclient')) {
            out.push(k);
            continue;
          }
          if (v && typeof v === 'object' && typeof v.createClient === 'function') out.push(k + ' (has createClient)');
        } catch (er) {}
      }
      return out.slice(0, 20);
    });
    console.log('POSSIBLE GLOBALS:', globals);
  } catch (e) {
    console.warn('Error inspecting globals:', e.message || e);
  }
  // Dump info about window.supabase specifically
  try {
    const supInfo = await page.evaluate(() => {
      if (typeof window.supabase === 'undefined') return { defined: false };
      const obj = window.supabase;
      return { defined: true, type: typeof obj, keys: obj ? Object.keys(obj).slice(0,50) : null };
    });
    console.log('window.supabase info:', supInfo);
  } catch (e) {
    console.warn('Error reading window.supabase:', e.message || e);
  }

  // Collect page console logs to help debug RLS/requests
  page.on('console', msg => {
    console.log('[PAGE LOG]', msg.type(), msg.text());
  });

  // Collect network responses for Supabase requests
  page.on('response', async (resp) => {
    try {
      const url = resp.url();
      if (url.includes('supabase.co') || url.includes('/rest/v1') || url.includes('/auth')) {
        const status = resp.status();
        let body = '';
        try { body = await resp.text(); } catch (e) { body = '<unreadable>'; }
        console.log('[PAGE RESPONSE]', status, url, body.slice(0, 200));
      }
    } catch (e) {
      console.warn('Error logging response', e.message || e);
    }
  });

  const storeUrl = `http://localhost:3000/?store=${created.store.slug}`;
  await page.goto(storeUrl);

  // Wait for product cards specifically in the storefront grid to render
  await page.waitForSelector('#store-products-grid .card', { timeout: 20000 });

  // Add to cart (first product in the storefront grid)
  await page.click('#store-products-grid .card >> button:has-text("Agregar")');
  await expect(page.locator('#cart-count')).toHaveText('1');

  // Open cart and submit order
  await page.click('button:has-text("Ver Pedido")');
  await page.waitForSelector('#modal-cart.modal.active');

  // Fill checkout form
  await page.fill('#modal-cart input[type="text"]', 'E2E Tester');
  await page.fill('#modal-cart input[type="tel"]', '+1234567890');
  await page.fill('#modal-cart textarea', 'Test order');

  // submit
  await page.click('#modal-cart button:has-text("Enviar Pedido")');

  // Wait a bit for order to be inserted
  await page.waitForTimeout(1500);

  // Verify order exists in DB
  const { data: orders, error: ordersErr } = await adminClient.from('orders').select('*').eq('store_id', created.store.id).order('created_at', { ascending: false }).limit(1);
  if (ordersErr) throw ordersErr;
  expect(orders.length).toBeGreaterThan(0);
  created.order = orders[0];
});

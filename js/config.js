var SUPABASE_URL = 'https://amfxytanmtvhferigddf.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtZnh5dGFubXR2aGZlcmlnZGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzUxNDEsImV4cCI6MjA4ODc1MTE0MX0.f_JyiyGJ2uNPBF-UOffBYDQKPHRvlPVh89Mfo1qibmo';
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Configuración de Super Admin (REEMPLAZA CON TU EMAIL)
var SUPER_ADMIN_EMAIL = 'enich@ejemplo.com'; 

// MODO DESARROLLADOR: Poner en true para saltar el login/registro si Supabase te bloquea
var DEV_MODE = false; 

console.log("Supabase initialized:", supabase);

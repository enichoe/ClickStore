var SUPABASE_URL = 'https://amfxytanmtvhferigddf.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtZnh5dGFubXR2aGZlcmlnZGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNzUxNDEsImV4cCI6MjA4ODc1MTE0MX0.f_JyiyGJ2uNPBF-UOffBYDQKPHRvlPVh89Mfo1qibmo';
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("Supabase initialized:", supabase);

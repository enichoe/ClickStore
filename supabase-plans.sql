-- ============================================================
-- SAAS SUBSCRIPTION PLANS SYSTEM
-- ============================================================

-- 1. Create Plans Table
CREATE TABLE IF NOT EXISTS public.plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    max_products INTEGER NOT NULL,
    features JSONB DEFAULT '[]',
    price_monthly NUMERIC(10,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Insert Default Plans
INSERT INTO public.plans (id, name, max_products, features, price_monthly)
VALUES 
('gratis', 'Plan Gratis', 10, '["whatsapp_orders", "basic_storefront"]', 0),
('economico', 'Plan Económico', 100, '["whatsapp_orders", "full_admin", "basic_stats", "cart"]', 19.00),
('pro', 'Plan Pro', 999999, '["whatsapp_orders", "full_admin", "advanced_stats", "custom_domain", "priority_support"]', 49.00)
ON CONFLICT (id) DO UPDATE SET
    max_products = EXCLUDED.max_products,
    features = EXCLUDED.features,
    price_monthly = EXCLUDED.price_monthly;

-- 3. Update Stores Table to include Plan
ALTER TABLE public.stores 
ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES public.plans(id) DEFAULT 'gratis';

-- Update existing stores to have a plan if they don't
UPDATE public.stores SET plan_id = 'gratis' WHERE plan_id IS NULL;

-- 4. RLS for Plans
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read access for plans" ON public.plans FOR SELECT USING (true);

-- 5. Helper Function to get store usage
CREATE OR REPLACE FUNCTION public.get_store_usage(p_store_id UUID)
RETURNS TABLE (
    product_count BIGINT,
    max_products INTEGER,
    plan_name TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM public.products WHERE store_id = p_store_id) as product_count,
        p.max_products,
        p.name as plan_name
    FROM public.stores s
    JOIN public.plans p ON s.plan_id = p.id
    WHERE s.id = p_store_id;
END;
$$;

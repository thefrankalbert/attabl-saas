-- Create newsletter_subscriber table
CREATE TABLE IF NOT EXISTS public.newsletter_subscriber (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.newsletter_subscriber ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public to insert (subscribe)
CREATE POLICY "Enable insert for public" ON public.newsletter_subscriber
    FOR INSERT
    WITH CHECK (true);

-- Policy: Allow only service_role (admin) to select/delete
CREATE POLICY "Enable select for service_role only" ON public.newsletter_subscriber
    FOR SELECT
    USING (auth.role() = 'service_role');

CREATE POLICY "Enable delete for service_role only" ON public.newsletter_subscriber
    FOR DELETE
    USING (auth.role() = 'service_role');

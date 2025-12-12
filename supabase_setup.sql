-- Drop the existing table (WARNING: This deletes all data)
DROP TABLE IF EXISTS products;

-- Create the new table
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    title TEXT NOT NULL,
    description TEXT,
    image TEXT,
    price TEXT DEFAULT 'Free',
    tags TEXT[] DEFAULT '{}',
    views BIGINT DEFAULT 0,
    likes BIGINT DEFAULT 0,
    saves BIGINT DEFAULT 0,
    rating NUMERIC DEFAULT 0.0
);

-- Enable Row Level Security (RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Create policies (Adjust as needed for your auth setup)
-- Allow read access to everyone
CREATE POLICY "Allow public read access" ON products
    FOR SELECT USING (true);

-- Allow insert/update/delete to everyone (for demo purposes, restrict in production)
CREATE POLICY "Allow public insert access" ON products
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update access" ON products
    FOR UPDATE USING (true);

CREATE POLICY "Allow public delete access" ON products
    FOR DELETE USING (true);

-- Create the increment_views function
CREATE OR REPLACE FUNCTION increment_views(row_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE products
  SET views = views + 1
  WHERE id = row_id;
END;
$$ LANGUAGE plpgsql;

-- Create Storage Bucket if it doesn't exist (You might need to do this in the Supabase Dashboard)
-- insert into storage.buckets (id, name) values ('products', 'products');
-- create policy "Public Access" on storage.objects for select using ( bucket_id = 'products' );
-- create policy "Public Insert" on storage.objects for insert with check ( bucket_id = 'products' );

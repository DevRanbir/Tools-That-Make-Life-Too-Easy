-- Enable the storage extension if not already enabled (usually enabled by default)
-- create extension if not exists "storage";

-- Create a new private bucket named 'drive'
insert into storage.buckets (id, name, public)
values ('drive', 'drive', false)
on conflict (id) do nothing;

-- Set up RLS policies for the 'drive' bucket
-- Allow authenticated users to upload files to their own folder (simulated using file naming or metadata, but here we'll just allow auth users to see all for now or filter by user_id if we store it in metadata)
-- For this simple implementation "files can be of any type but not Folders", we will just store them in root or a user-specific 'folder' prefix if we want separation. 
-- However, "they will all be files always" suggests a flat structure. 
-- Let's stick to: Users can see/upload their own files. Standard pattern is `uid/filename`.

-- Policy: Give users access to their own files (prefixed with their user_id)
create policy "Individual user Access"
on storage.objects for all
using ( bucket_id = 'drive' and auth.uid()::text = (storage.foldername(name))[1] )
with check ( bucket_id = 'drive' and auth.uid()::text = (storage.foldername(name))[1] );

-- Run this in your Supabase SQL Editor to update the user_details table

ALTER TABLE user_details 
ADD COLUMN role text DEFAULT 'freebiee',
ADD COLUMN credits integer DEFAULT 0;

-- Ensure existing users have these values set
UPDATE user_details SET role = 'freebiee' WHERE role IS NULL;
UPDATE user_details SET credits = 0 WHERE credits IS NULL;

-- Create a function to handle the credit reset logic
CREATE OR REPLACE FUNCTION reset_monthly_credits()
RETURNS void AS $$
BEGIN
    UPDATE user_details
    SET credits = LEAST(
        credits + CASE 
            WHEN role = 'freebiee' THEN 0 
            WHEN role = 'common' THEN 20 
            WHEN role = 'wealthy' THEN 50 
            WHEN role = 'administrator' THEN 100 
            ELSE 0 
        END, 
        (CASE 
            WHEN role = 'freebiee' THEN 0 
            WHEN role = 'common' THEN 20 
            WHEN role = 'wealthy' THEN 50 
            WHEN role = 'administrator' THEN 100 
            ELSE 0 
        END) + 10
    );
END;
$$ LANGUAGE plpgsql;

-- To run this manually once to test:
-- SELECT reset_monthly_credits();

-- To schedule this (if you have pg_cron extension enabled):
-- SELECT cron.schedule('0 0 1 * *', 'SELECT reset_monthly_credits()');

import { supabase } from '../supabase';
import { toast } from 'sonner';

export const logTransaction = async (userId, amount, type, description, currentTotal) => {
    if (!userId) return;
    try {
        const { data: user, error: fetchError } = await supabase
            .from('user_details')
            .select('logs')
            .eq('id', userId)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') { // Ignore not found, though user should exist
            console.error('Error fetching logs for update:', fetchError);
            return;
        }

        const currentLogs = (user && user.logs && Array.isArray(user.logs)) ? user.logs : [];
        const newLog = {
            credits_spent: amount,
            current_total_credits: currentTotal,
            type, // 'credit' or 'debit'
            description,
            created_at: new Date().toISOString()
        };

        // IMPORTANT: Update the entire logs array to trigger the database trigger
        // Force a complete replacement by creating a new array reference
        const updatedLogs = JSON.parse(JSON.stringify([...currentLogs, newLog]));

        const { error: updateError } = await supabase
            .from('user_details')
            .update({ logs: updatedLogs })
            .eq('id', userId);

        if (updateError) {
            console.error('Error updating logs:', updateError);
        } else {
            // Show alert on successful log
            if (type === 'credit') {
                toast.success(`Credited ${amount} Credits`, {
                    description: description
                });
            } else if (type === 'debit') {
                toast.success(`Deducted ${amount} Credits`, {
                    description: description
                });
            }
        }
    } catch (error) {
        console.error('Error logging transaction:', error);
    }
};

// New function to update credits AND logs in a single query (ensures trigger fires)
export const updateCreditsWithLog = async (userId, newCredits, changeAmount, description) => {
    if (!userId) return { success: false, error: 'No user ID provided' };
    
    try {
        const logType = changeAmount > 0 ? 'credit' : 'debit';
        const creditsSpent = Math.abs(changeAmount);

        // Use Postgres function to update credits and logs in a SINGLE UPDATE statement
        // This ensures the trigger fires correctly
        const { error } = await supabase.rpc('update_credits_with_log', {
            user_id: userId,
            new_credits: newCredits,
            credits_spent: creditsSpent,
            log_type: logType,
            log_description: description
        });

        if (error) {
            console.error('Error updating credits and logs:', error);
            return { success: false, error };
        }

        // Show toast notification
        if (changeAmount > 0) {
            toast.success(`Credited ${creditsSpent} Credits`, {
                description: description
            });
        } else if (changeAmount < 0) {
            toast.success(`Deducted ${creditsSpent} Credits`, {
                description: description
            });
        }

        return { success: true, newCredits };
    } catch (error) {
        console.error('Error in updateCreditsWithLog:', error);
        return { success: false, error };
    }
};
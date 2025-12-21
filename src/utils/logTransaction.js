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

        const updatedLogs = [...currentLogs, newLog];

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

import React, { useState, useEffect } from 'react';
import { Mail, Eye, Edit2, Send, Loader2, Check, AlertCircle } from 'lucide-react';

const EmailViewer = ({ emailData }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedEmail, setEditedEmail] = useState(emailData);
    const [plainTextBody, setPlainTextBody] = useState('');
    const [originalPlainText, setOriginalPlainText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [sendStatus, setSendStatus] = useState(null);

    // Extract plain text from HTML for editing
    const extractPlainText = (html) => {
        if (!html) return '';
        // Remove code block markers
        let text = html.replace(/```html\n?/gi, '').replace(/```\n?/g, '');
        // Create a temporary DOM element to extract text
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        // Get text content and clean up
        let plainText = tempDiv.textContent || tempDiv.innerText || '';
        // Clean up extra whitespace
        plainText = plainText.replace(/\n{3,}/g, '\n\n').trim();
        return plainText;
    };

    const cleanHTML = (html) => {
        if (!html) return '';
        // Remove code block markers
        let cleaned = html.replace(/```html\n?/gi, '').replace(/```\n?/g, '');
        // Remove escaped HTML entities
        cleaned = cleaned.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        // Remove style tags
        cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        // Remove DOCTYPE, html, head
        cleaned = cleaned.replace(/<!DOCTYPE[^>]*>/gi, '');
        cleaned = cleaned.replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '');
        cleaned = cleaned.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
        return cleaned.trim();
    };

    // Initialize state when emailData changes
    useEffect(() => {
        if (emailData) {
            setEditedEmail(emailData);
            const initialPlainText = extractPlainText(emailData.body);
            setPlainTextBody(initialPlainText);
            setOriginalPlainText(initialPlainText);
        }
    }, [emailData]);

    const handleSend = async () => {
        if (!editedEmail.to || !editedEmail.subject || !editedEmail.body) {
            setSendStatus({
                type: 'error',
                message: 'Please fill in all fields (To, Subject, Body)'
            });
            return;
        }

        setIsSending(true);
        setSendStatus(null);

        try {
            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: editedEmail.to,
                    subject: editedEmail.subject,
                    body: editedEmail.body
                }),
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setIsSent(true);
                setSendStatus({
                    type: 'success',
                    message: 'Email sent successfully!'
                });
            } else {
                setSendStatus({
                    type: 'error',
                    message: data.error || 'Failed to send email. Please check configuration.'
                });
            }
        } catch (error) {
            setSendStatus({
                type: 'error',
                message: 'Error sending email: ' + error.message
            });
        } finally {
            setIsSending(false);
        }
    };

    const toggleEdit = () => {
        if (isEditing) {
            // Saving changes
            // Convert plain text back to HTML for the body
            const htmlBody = plainTextBody.split('\n').map(line =>
                line.trim() ? `<p>${line}</p>` : '<br/>'
            ).join('');

            setEditedEmail(prev => ({
                ...prev,
                body: htmlBody
            }));
        }
        setIsEditing(!isEditing);
    };

    const emailBody = cleanHTML(editedEmail.body);
    const hasHTML = /<[a-z][\s\S]*>/i.test(emailBody);

    if (isSent) {
        return (
            <div className="w-full max-w-2xl bg-card rounded-xl border border-border shadow-sm p-8 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in-95 duration-300">
                <div className="w-16 h-16 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mb-2">
                    <Check size={32} />
                </div>
                <h3 className="text-xl font-semibold text-foreground">Email Sent Successfully!</h3>
                <p className="text-muted-foreground max-w-md">
                    Your email to <span className="font-medium text-foreground">{editedEmail.to}</span> has been sent.
                </p>
                <div className="flex gap-3 mt-4">
                    <button
                        onClick={() => setIsSent(false)}
                        className="px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors text-sm font-medium"
                    >
                        Send Another
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-2xl bg-card rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between bg-card/50 backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-primary/10 rounded-lg text-primary">
                        <Mail size={18} />
                    </div>
                    <span className="font-semibold text-foreground">Email Draft</span>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={toggleEdit}
                        className={`p-2 rounded-full transition-all duration-200 ${isEditing ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                        title={isEditing ? "View Preview" : "Edit Email"}
                    >
                        {isEditing ? <Eye size={18} /> : <Edit2 size={18} />}
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={isSending}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-sm font-medium transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                        {isSending ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send size={16} className="group-hover:translate-x-0.5 transition-transform" />
                                Send
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Status Message */}
            {sendStatus && (
                <div className={`px-6 py-2 text-xs font-medium flex items-center gap-2 ${sendStatus.type === 'success'
                    ? 'bg-green-500/10 text-green-600 border-b border-green-500/10'
                    : 'bg-red-500/10 text-red-600 border-b border-red-500/10'
                    }`}>
                    {sendStatus.type === 'success' ? <Check size={12} /> : <AlertCircle size={12} />}
                    {sendStatus.message}
                </div>
            )}

            {/* Content Form */}
            <div className="p-6 space-y-6">
                {isEditing ? (
                    <div className="space-y-5 animate-in fade-in duration-300">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide ml-1">To</label>
                            <input
                                type="email"
                                value={editedEmail.to}
                                onChange={(e) => setEditedEmail({ ...editedEmail, to: e.target.value })}
                                className="w-full px-4 py-2.5 bg-secondary/30 border border-border/50 hover:border-border focus:border-primary/50 focus:bg-secondary/50 rounded-xl text-sm transition-all outline-none"
                                placeholder="recipient@example.com"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide ml-1">Subject</label>
                            <input
                                type="text"
                                value={editedEmail.subject}
                                onChange={(e) => setEditedEmail({ ...editedEmail, subject: e.target.value })}
                                className="w-full px-4 py-2.5 bg-secondary/30 border border-border/50 hover:border-border focus:border-primary/50 focus:bg-secondary/50 rounded-xl text-sm transition-all outline-none font-medium"
                                placeholder="Email subject"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide ml-1">Body</label>
                            <textarea
                                value={plainTextBody}
                                onChange={(e) => setPlainTextBody(e.target.value)}
                                className="w-full px-4 py-3 bg-secondary/30 border border-border/50 hover:border-border focus:border-primary/50 focus:bg-secondary/50 rounded-xl text-sm transition-all outline-none min-h-[250px] resize-none leading-relaxed"
                                placeholder="Write your email content here..."
                            />
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        {/* To Field */}
                        <div className="border-b border-border/40 pb-4">
                            <div className="text-xs text-muted-foreground mb-1">To:</div>
                            <div className="text-base font-medium text-foreground tracking-tight">{editedEmail.to || 'Not specified'}</div>
                        </div>

                        {/* Subject Field */}
                        <div className="border-b border-border/40 pb-4">
                            <div className="text-xs text-muted-foreground mb-1">Subject:</div>
                            <div className="text-lg font-semibold text-foreground tracking-tight">{editedEmail.subject || 'No Subject'}</div>
                        </div>

                        {/* Preview Area */}
                        <div className="space-y-2">
                            <div className="text-xs text-muted-foreground">Preview:</div>
                            <div className="bg-white text-zinc-900 rounded-xl p-6 shadow-sm border border-zinc-200/60 min-h-[200px] max-h-[400px] overflow-auto">
                                {hasHTML ? (
                                    <div
                                        dangerouslySetInnerHTML={{ __html: emailBody }}
                                        className="prose prose-sm max-w-none text-zinc-800"
                                        style={{
                                            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                                        }}
                                    />
                                ) : (
                                    <div className="whitespace-pre-wrap text-zinc-800 leading-relaxed font-sans">
                                        {emailBody || <span className="text-zinc-400 italic">No content</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EmailViewer;
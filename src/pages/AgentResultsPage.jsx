import React, { useState, useEffect } from 'react';
import Masonry from '../components/Masonry';
import ResultDrawer from '../components/ResultDrawer';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import { Loader2 } from 'lucide-react';
import { supabase } from '../supabase';

const AgentResultsPage = ({ type, title, user }) => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    useEffect(() => {
        const fetchItems = async () => {
            setLoading(true);
            try {
                if (!user) {
                    console.log('No user logged in');
                    setItems([]);
                    setLoading(false);
                    return;
                }

                // Use user.id directly as UUID (no need for whatsapp_users lookup for web users)
                let userUuid = user.id;

                console.log('Fetching files for user:', userUuid, 'type:', type);

                // List files from Supabase Storage
                const folderPath = `${userUuid}/${type}`;
                const { data: files, error: listError } = await supabase
                    .storage
                    .from('drive')
                    .list(folderPath, {
                        limit: 100,
                        sortBy: { column: 'created_at', order: 'desc' }
                    });

                if (listError) {
                    console.error('Error listing files:', listError);
                    setItems([]);
                    setLoading(false);
                    return;
                }

                console.log('Found files:', files);

                // Get public URLs and map to Masonry format
                const mappedItems = files
                    .filter(file => !file.name.endsWith('.json')) // Filter out metadata files
                    .map(file => {
                        const { data: urlData } = supabase
                            .storage
                            .from('drive')
                            .getPublicUrl(`${folderPath}/${file.name}`);

                        return {
                            id: file.id || file.name,
                            title: file.name.split('_').slice(0, -1).join(' ').replace(/\.(png|jpg|jpeg|mermaid|md|txt)$/i, ''),
                            description: `Created ${new Date(file.created_at).toLocaleDateString()}`,
                            img: type === 'images' ? urlData.publicUrl : null,
                            tags: [type],
                            height: Math.floor(Math.random() * (600 - 300 + 1) + 300),
                            // Store full item data for the drawer
                            fullData: {
                                ...file,
                                url: urlData.publicUrl,
                                type: type
                            }
                        };
                    });

                console.log('Mapped items:', mappedItems);
                setItems(mappedItems);
            } catch (error) {
                console.error("Error fetching items:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchItems();
    }, [type, user]);

    const handleItemClick = async (item) => {
        let contentToDisplay = item.fullData.url;

        // Fetch text content for text-based types
        if (type === 'flowcharts' || type === 'research' || type === 'case_studies' || type === 'documents' || type === 'tags') {
            try {
                // If it's a relative URL or internal, ensure we can fetch it. 
                // Public URLs from supabase are usually absolute.
                const response = await fetch(item.fullData.url);
                if (response.ok) {
                    contentToDisplay = await response.text();
                }
            } catch (error) {
                console.error("Error fetching file content:", error);
            }
        }

        setSelectedItem({ ...item.fullData, fetchedContent: contentToDisplay });
        setDrawerOpen(true);
    };

    // Determine content for drawer based on type
    const getDrawerContent = () => {
        if (!selectedItem) return null;

        if (selectedItem.fetchedContent) {
            return selectedItem.fetchedContent;
        }

        if (type === 'images') {
            return selectedItem.url;
        } else if (type === 'emails') {
            return selectedItem; // EmailViewer expects the full email object
        } else if (type === 'presentations') {
            return selectedItem.url || "Presentation content not available for preview.";
        }
        return JSON.stringify(selectedItem, null, 2);
    };

    const getDrawerType = () => {
        if (type === 'flowcharts') return 'flowchart';
        if (type === 'images') return 'image';
        if (type === 'emails') return 'email';
        if (type === 'research' || type === 'case_studies' || type === 'documents') return 'markdown';
        return 'text';
    };

    return (
        <div className="min-h-screen bg-background text-foreground pb-20">
            <MagneticMorphingNav />

            <div className="pt-32 px-4 sm:px-8 max-w-[1600px] mx-auto">
                <div className="mb-8">
                    <h1 className="text-4xl font-bold mb-2">{title}</h1>
                    <p className="text-muted-foreground">Generated content from {title} Agent</p>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 className="animate-spin text-primary" size={32} />
                    </div>
                ) : items.length > 0 ? (
                    <Masonry
                        items={items}
                        onItemClick={handleItemClick}
                        user={user}
                    />
                ) : (
                    <div className="text-center py-20 text-muted-foreground">
                        No items found.
                    </div>
                )}
            </div>

            <ResultDrawer
                isOpen={drawerOpen}
                onClose={setDrawerOpen}
                content={getDrawerContent()}
                title={selectedItem?.title || title}
                type={getDrawerType()}
            />
        </div>
    );
};

export default AgentResultsPage;
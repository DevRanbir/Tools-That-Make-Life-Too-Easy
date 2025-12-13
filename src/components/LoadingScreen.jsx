import React, { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import animationData from '../assets/loading.json';

const LoadingScreen = ({ darkMode, fadeOut, isGlobal }) => {
    const animationDataWithTheme = React.useMemo(() => {
        // Deep clone the animation data to avoid mutating the original source
        const animData = JSON.parse(JSON.stringify(animationData));

        // The arrow is in assets[0].layers[2] ("yedek imlec 5")
        // shapes[0].it[1] (Stroke 1) and shapes[0].it[2] (Fill 1)
        try {
            const arrowLayer = animData.assets[0].layers.find(l => l.nm === "yedek imlec 5");
            if (arrowLayer) {
                const shapes = arrowLayer.shapes[0].it;
                const arrowColor = darkMode ? [1, 1, 1, 1] : [0, 0, 0, 1]; // White in dark mode, Black in light

                // Update Stroke 1
                if (shapes[1] && shapes[1].nm === "Stroke 1") {
                    shapes[1].c.k = arrowColor;
                }
                // Update Fill 1
                if (shapes[2] && shapes[2].nm === "Fill 1") {
                    shapes[2].c.k = arrowColor;
                }
            }
        } catch (e) {
            console.error("Failed to modify Lottie colors", e);
        }

        return animData;
    }, [darkMode]);

    return (
        <div
            className={`${isGlobal ? 'fixed inset-0 z-[9999]' : 'absolute inset-0 z-50'} flex items-center justify-center transition-opacity duration-700 ease-in-out ${fadeOut ? 'opacity-0' : 'opacity-100'}`}
            style={{ backgroundColor: darkMode ? '#0a0a0a' : '#f2f5f3' }}
        >
            <div className="w-64 h-64 md:w-96 md:h-96">
                <Lottie
                    animationData={animationDataWithTheme}
                    loop={true}
                    autoplay={true}
                />
            </div>
        </div>
    );
};

export default LoadingScreen;

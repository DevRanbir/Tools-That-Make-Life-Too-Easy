
import React from 'react';
import { TrendingUp } from 'lucide-react';
import MagneticMorphingNav from '../components/MagneticMorphingNav';
import Lottie from 'lottie-react';
import errorAnimation from '../assets/error.json';

const ErrorPage = ({ navigateOnly, pageName = 'Error', user }) => {

    return (
        <div className="feed-page min-h-screen bg-background relative pb-24">
            <div className={`hero-sticky-wrapper`}>
                <div className="hero-section">
                    <h1 className="hero-title">
                        Tools That Make Life <br /> Too Easy
                    </h1>
                    <p className="hero-subtitle">
                          
                    </p>
                </div>
            </div>

            <div className="content-overlay content-area pt-12">
                <div
                    className="masonry-wrapper"
                    style={{ margin: '0 auto', width: '100%', maxWidth: '100%', padding: '0 20px' }}
                >
                    <div className="flex flex-col items-center justify-center py-10">
                        <div className="w-full max-w-md">
                            <Lottie animationData={errorAnimation} loop={true} />
                        </div>
                        <h2 className="text-xl mt-4 font-semibold text-muted-foreground">
                            Oops! The page you're looking for doesn't exist.
                        </h2>
                        <button
                            onClick={() => navigateOnly('manual')}
                            className="mt-6 px-6 py-2 bg-foreground text-background rounded-full font-medium hover:opacity-90 transition-opacity"
                        >
                            Return Home
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ErrorPage;

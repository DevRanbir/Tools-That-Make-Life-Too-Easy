
import React from 'react';
import ErrorPage from '../pages/ErrorPage';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // Render the custom ErrorPage
            // We pass a dummy navigateOnly that initiates a hard reload or resets state
            const handleReset = () => {
                window.location.href = '/';
            };

            return <ErrorPage
                navigateOnly={handleReset}
                pageName="System Error"
                user={null} // We might not have user info if the crash was early, safe to pass null
            />;
        }

        return this.props.children;
    }
}

export default ErrorBoundary;

// API endpoint cache with automatic failover
class APICache {
    constructor() {
        this.endpoints = [
            //' /api/process-stream', // Local proxy (older method)
            'https://bianca-wheat.vercel.app/api/process-stream' // Direct backend (works on Appwrite & Vercel)
        ];
        this.currentEndpointIndex = 0;
        this.lastSuccessfulEndpoint = null;
    }

    getCurrentEndpoint() {
        // Use last successful endpoint if available
        if (this.lastSuccessfulEndpoint) {
            return this.lastSuccessfulEndpoint;
        }
        return this.endpoints[this.currentEndpointIndex];
    }

    markSuccess(endpoint) {
        this.lastSuccessfulEndpoint = endpoint;
    }

    getNextEndpoint() {
        // Try the next endpoint in the list
        this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
        return this.endpoints[this.currentEndpointIndex];
    }

    async fetchWithFallback(requestBody, signal = null) {
        const maxAttempts = this.endpoints.length;
        let lastError = null;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const endpoint = attempt === 0 ? this.getCurrentEndpoint() : this.getNextEndpoint();
            
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal
                });

                if (response.ok) {
                    this.markSuccess(endpoint);
                    return response;
                }
                
                lastError = new Error(`Endpoint ${endpoint} returned status ${response.status}`);
            } catch (error) {
                lastError = error;
            }
        }

        // All endpoints failed
        throw lastError || new Error('All API endpoints failed');
    }

    reset() {
        this.currentEndpointIndex = 0;
        this.lastSuccessfulEndpoint = null;
    }
}

// Export singleton instance
export const apiCache = new APICache();

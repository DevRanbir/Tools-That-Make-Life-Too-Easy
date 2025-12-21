import React from 'react';
import AgentResultsPage from './AgentResultsPage';

const Research = ({ user }) => {
    return <AgentResultsPage type="research" title="Research" user={user} />;
};

export default Research;
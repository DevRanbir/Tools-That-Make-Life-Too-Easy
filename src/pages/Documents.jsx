import React from 'react';
import AgentResultsPage from './AgentResultsPage';

const Documents = ({ user }) => {
    return <AgentResultsPage type="documents" title="Documents" user={user} />;
};

export default Documents;
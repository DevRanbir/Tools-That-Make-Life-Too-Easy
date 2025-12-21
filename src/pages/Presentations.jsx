import React from 'react';
import AgentResultsPage from './AgentResultsPage';

const Presentations = ({ user }) => {
    return <AgentResultsPage type="presentations" title="Presentations" user={user} />;
};

export default Presentations;
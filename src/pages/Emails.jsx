import React from 'react';
import AgentResultsPage from './AgentResultsPage';

const Emails = ({ user }) => {
    return <AgentResultsPage type="emails" title="Emails" user={user} />;
};

export default Emails;
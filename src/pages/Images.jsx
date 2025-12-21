import React from 'react';
import AgentResultsPage from './AgentResultsPage';

const Images = ({ user }) => {
    return <AgentResultsPage type="images" title="Images" user={user} />;
};

export default Images;
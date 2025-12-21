import React from 'react';
import AgentResultsPage from './AgentResultsPage';

const Flowcharts = ({ user }) => {
    return <AgentResultsPage type="flowcharts" title="Flowcharts" user={user} />;
};

export default Flowcharts;
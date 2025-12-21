import React from 'react';
import AgentResultsPage from './AgentResultsPage';

const CaseStudies = ({ user }) => {
    return <AgentResultsPage type="case_studies" title="Case Studies" user={user} />;
};

export default CaseStudies;
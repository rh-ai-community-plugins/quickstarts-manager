import React, { useState } from 'react';
import {
  PageSection,
  EmptyState,
  EmptyStateBody,
} from '@patternfly/react-core';
import { ProjectSelector } from '~/app/components/ProjectSelector';
import { useLastSelectedProject } from '~/app/hooks/useLastSelectedProject';

const QuickstartsPage: React.FC = () => {
  const [lastProject, setLastProject] = useLastSelectedProject();
  const [selectedProject, setSelectedProject] = useState<string | null>(
    lastProject,
  );

  const handleProjectSelect = (project: string | null) => {
    setSelectedProject(project);
    setLastProject(project);
  };

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <ProjectSelector
          selectedProject={selectedProject}
          onSelect={handleProjectSelect}
        />
      </PageSection>
      <PageSection hasBodyWrapper={false}>
        {selectedProject ? (
          <EmptyState headingLevel="h2" titleText="Quickstarts">
            <EmptyStateBody>
              Catalog and status views for project{' '}
              <strong>{selectedProject}</strong> will be rendered here.
            </EmptyStateBody>
          </EmptyState>
        ) : (
          <EmptyState headingLevel="h2" titleText="Quickstarts">
            <EmptyStateBody>
              Select a project to browse available quickstarts or view deployed
              quickstart status.
            </EmptyStateBody>
          </EmptyState>
        )}
      </PageSection>
    </>
  );
};

export default QuickstartsPage;

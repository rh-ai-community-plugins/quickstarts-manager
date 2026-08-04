import React, { useState } from 'react';
import {
  PageSection,
  EmptyState,
  EmptyStateBody,
  Spinner,
  Alert,
} from '@patternfly/react-core';
import { ProjectSelector } from '~/app/components/ProjectSelector';
import { CatalogView } from '~/app/components/CatalogView';
import { useLastSelectedProject } from '~/app/hooks/useLastSelectedProject';
import { useQuickstartCatalog } from '~/app/hooks/useQuickstartCatalog';
import { useQuickstartStatus } from '~/app/hooks/useQuickstartStatus';

const QuickstartsPage: React.FC = () => {
  const [lastProject, setLastProject] = useLastSelectedProject();
  const [selectedProject, setSelectedProject] = useState<string | null>(
    lastProject,
  );

  const catalog = useQuickstartCatalog();
  const status = useQuickstartStatus(selectedProject);

  const handleProjectSelect = (project: string | null) => {
    setSelectedProject(project);
    setLastProject(project);
  };

  const renderContent = () => {
    if (!selectedProject) {
      return (
        <EmptyState headingLevel="h2" titleText="Quickstarts">
          <EmptyStateBody>
            Select a project to browse available quickstarts or view deployed
            quickstart status.
          </EmptyStateBody>
        </EmptyState>
      );
    }

    if (status.loading) {
      return <Spinner aria-label="Checking namespace status" />;
    }

    if (status.error) {
      return (
        <Alert variant="warning" title="Could not check namespace status" isInline>
          {status.error}
        </Alert>
      );
    }

    if (status.status) {
      return (
        <EmptyState headingLevel="h2" titleText="Quickstart deployed">
          <EmptyStateBody>
            <strong>{status.status.release.name}</strong> (
            {status.status.release.chart}) is deployed in{' '}
            <strong>{selectedProject}</strong> with status{' '}
            <strong>{status.status.release.status}</strong>.
            <br />
            The full status view will be available in Phase 6.
          </EmptyStateBody>
        </EmptyState>
      );
    }

    return (
      <CatalogView
        quickstarts={catalog.quickstarts}
        loading={catalog.loading}
        error={catalog.error}
        onRefresh={catalog.refresh}
        namespace={selectedProject}
      />
    );
  };

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <ProjectSelector
          selectedProject={selectedProject}
          onSelect={handleProjectSelect}
        />
      </PageSection>
      <PageSection hasBodyWrapper={false}>{renderContent()}</PageSection>
    </>
  );
};

export default QuickstartsPage;

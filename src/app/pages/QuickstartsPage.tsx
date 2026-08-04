import React, { useState, useCallback } from 'react';
import {
  PageSection,
  EmptyState,
  EmptyStateBody,
  Spinner,
  Alert,
} from '@patternfly/react-core';
import { ProjectSelector } from '~/app/components/ProjectSelector';
import { CatalogView } from '~/app/components/CatalogView';
import { StatusView } from '~/app/components/StatusView';
import LifecycleProgressModal from '~/app/components/LifecycleProgressModal';
import RemoveQuickstartModal from '~/app/components/RemoveQuickstartModal';
import { useLastSelectedProject } from '~/app/hooks/useLastSelectedProject';
import { useQuickstartCatalog } from '~/app/hooks/useQuickstartCatalog';
import { useQuickstartStatus } from '~/app/hooks/useQuickstartStatus';
import { useQuickstartLifecycle } from '~/app/hooks/useQuickstartLifecycle';
import type { CatalogQuickstart } from '~/app/types/catalog';

const QuickstartsPage: React.FC = () => {
  const [lastProject, setLastProject] = useLastSelectedProject();
  const [selectedProject, setSelectedProject] = useState<string | null>(
    lastProject,
  );

  const catalog = useQuickstartCatalog();
  const status = useQuickstartStatus(selectedProject);
  const lifecycle = useQuickstartLifecycle();

  const [showProgress, setShowProgress] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const handleProjectSelect = (project: string | null) => {
    setSelectedProject(project);
    setLastProject(project);
  };

  const handleInstall = useCallback(
    async (quickstart: CatalogQuickstart) => {
      if (!selectedProject) return;
      setShowProgress(true);
      await lifecycle.install(quickstart.name, selectedProject);
    },
    [selectedProject, lifecycle.install],
  );

  const handleUpgrade = useCallback(async () => {
    if (!selectedProject || !status.status) return;
    setShowProgress(true);
    await lifecycle.upgrade(status.status.release.name, selectedProject);
  }, [selectedProject, status.status, lifecycle.upgrade]);

  const handleRemoveConfirm = useCallback(async () => {
    if (!selectedProject || !status.status) return;
    setShowRemoveConfirm(false);
    setShowProgress(true);
    await lifecycle.remove(status.status.release.name, selectedProject);
  }, [selectedProject, status.status, lifecycle.remove]);

  const handleProgressClose = useCallback(() => {
    setShowProgress(false);
    lifecycle.reset();
    status.refresh();
  }, [lifecycle.reset, status.refresh]);

  const catalogVersion = status.status
    ? catalog.quickstarts.find(
        (q) => q.name === status.status?.release.name,
      )?.version
    : undefined;

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
        <Alert
          variant="warning"
          title="Could not check namespace status"
          isInline
        >
          {status.error}
        </Alert>
      );
    }

    if (status.status) {
      return (
        <StatusView
          status={status.status}
          catalogVersion={catalogVersion}
          namespace={selectedProject}
          onUpgrade={handleUpgrade}
          onRemove={() => setShowRemoveConfirm(true)}
          onRefresh={status.refresh}
          isLifecycleLoading={lifecycle.loading}
        />
      );
    }

    return (
      <CatalogView
        quickstarts={catalog.quickstarts}
        loading={catalog.loading}
        error={catalog.error}
        onRefresh={catalog.refresh}
        namespace={selectedProject}
        onInstall={handleInstall}
      />
    );
  };

  return (
    <>
      <PageSection hasBodyWrapper={false}>
        <ProjectSelector
          selectedProject={selectedProject}
          onSelect={handleProjectSelect}
          isDisabled={lifecycle.loading}
        />
      </PageSection>
      <PageSection hasBodyWrapper={false}>{renderContent()}</PageSection>

      <LifecycleProgressModal
        isOpen={showProgress}
        operation={lifecycle.operation}
        steps={lifecycle.loading ? lifecycle.steps : (lifecycle.result?.steps ?? [])}
        success={lifecycle.loading ? null : (lifecycle.result?.success ?? null)}
        message={lifecycle.result?.message ?? null}
        onClose={handleProgressClose}
      />

      <RemoveQuickstartModal
        quickstartName={status.status?.release.name ?? null}
        isOpen={showRemoveConfirm}
        isLoading={lifecycle.loading}
        onConfirm={handleRemoveConfirm}
        onCancel={() => setShowRemoveConfirm(false)}
      />
    </>
  );
};

export default QuickstartsPage;

import React, { useState, useCallback } from 'react';
import {
  PageSection,
  EmptyState,
  EmptyStateBody,
  Alert,
} from '@patternfly/react-core';
import { ProjectSelector } from '~/app/components/ProjectSelector';
import { CatalogView } from '~/app/components/CatalogView';
import { StatusView } from '~/app/components/StatusView';
import { StatusSkeleton } from '~/app/components/StatusSkeleton';
import LifecycleProgressModal from '~/app/components/LifecycleProgressModal';
import RemoveQuickstartModal from '~/app/components/RemoveQuickstartModal';
import { useLastSelectedProject } from '~/app/hooks/useLastSelectedProject';
import { useQuickstartCatalog } from '~/app/hooks/useQuickstartCatalog';
import { useQuickstartStatus } from '~/app/hooks/useQuickstartStatus';
import { useQuickstartLifecycle } from '~/app/hooks/useQuickstartLifecycle';
import { isProtectedNamespace } from '~/app/utils/namespace';
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

  const isProtected = selectedProject ? isProtectedNamespace(selectedProject) : false;

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
      return <StatusSkeleton />;
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
        <>
          <div
            className="pf-v6-u-font-size-sm pf-v6-u-mb-sm"
            style={{ color: 'var(--pf-t--global--text--color--subtle)' }}
          >
            The following quickstart is already deployed in this project. Choose
            another project to access the Quickstarts catalog.
          </div>
          <StatusView
            status={status.status}
            catalogVersion={catalogVersion}
            namespace={selectedProject}
            onUpgrade={handleUpgrade}
            onRemove={() => setShowRemoveConfirm(true)}
            onRefresh={status.refresh}
            isLifecycleLoading={lifecycle.loading}
          />
        </>
      );
    }

    return (
      <>
        {isProtected && (
          <Alert
            variant="warning"
            title="Protected namespace"
            isInline
            className="pf-v6-u-mb-md"
          >
            Installing quickstarts into system namespaces is not allowed.
            Select a different project.
          </Alert>
        )}
        <CatalogView
          quickstarts={catalog.quickstarts}
          loading={catalog.loading}
          error={catalog.error}
          onRefresh={catalog.refresh}
          namespace={selectedProject}
          onInstall={isProtected ? undefined : handleInstall}
        />
      </>
    );
  };

  return (
    <>
      <PageSection hasBodyWrapper={false} className="pf-v6-u-pb-0">
        <ProjectSelector
          selectedProject={selectedProject}
          onSelect={handleProjectSelect}
          isDisabled={lifecycle.loading}
        />
      </PageSection>
      <div aria-live="polite" className="pf-v6-screen-reader">
        {!selectedProject
          ? 'Select a project'
          : status.loading
            ? 'Loading status…'
            : status.status
              ? `Quickstart deployed: ${status.status.release.name}`
              : 'Showing catalog'}
      </div>
      <PageSection hasBodyWrapper={false} className="pf-v6-u-pt-md">
        {renderContent()}
      </PageSection>

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

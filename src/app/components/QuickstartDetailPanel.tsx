import React, { useMemo } from 'react';
import {
  Button,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
  List,
  ListItem,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  Tooltip,
} from '@patternfly/react-core';
import {
  CheckCircleIcon,
  ExternalLinkAltIcon,
  TimesCircleIcon,
} from '@patternfly/react-icons';
import { CatalogQuickstart } from '~/app/types/catalog';
import { useAccessReview } from '~/app/hooks/useAccessReview';
import type { PermissionCheck } from '~/app/hooks/useAccessReview';

const RESOURCE_DISPLAY_NAMES: Record<string, string> = {
  pods: 'Pods',
  services: 'Services',
  secrets: 'Secrets',
  configmaps: 'ConfigMaps',
  serviceaccounts: 'ServiceAccounts',
  persistentvolumeclaims: 'PersistentVolumeClaims',
  deployments: 'Deployments',
  statefulsets: 'StatefulSets',
  daemonsets: 'DaemonSets',
  replicasets: 'ReplicaSets',
  ingresses: 'Ingresses',
  networkpolicies: 'NetworkPolicies',
  roles: 'Roles',
  rolebindings: 'RoleBindings',
  clusterroles: 'ClusterRoles',
  clusterrolebindings: 'ClusterRoleBindings',
  routes: 'Routes',
  deploymentconfigs: 'DeploymentConfigs',
  buildconfigs: 'BuildConfigs',
  imagestreams: 'ImageStreams',
  inferenceservices: 'InferenceServices',
  servingruntimes: 'ServingRuntimes',
  notebooks: 'Notebooks',
  namespaces: 'Namespaces',
  jobs: 'Jobs',
  cronjobs: 'CronJobs',
};

function resourceDisplayName(resource: string): string {
  return RESOURCE_DISPLAY_NAMES[resource] ??
    resource.charAt(0).toUpperCase() + resource.slice(1);
}

export interface QuickstartDetailPanelProps {
  quickstart: CatalogQuickstart;
  namespace: string;
  isOpen: boolean;
  onClose: () => void;
  onInstall?: (quickstart: CatalogQuickstart) => void;
}

export const QuickstartDetailPanel: React.FC<QuickstartDetailPanelProps> = ({
  quickstart,
  namespace,
  isOpen,
  onClose,
  onInstall,
}) => {
  const permissionsKey = JSON.stringify(quickstart.rbac?.requiredPermissions);
  const permissions: PermissionCheck[] | undefined = useMemo(
    () =>
      quickstart.rbac?.requiredPermissions?.map((p) => ({
        apiGroup: p.apiGroup,
        resource: p.resource,
        verbs: p.verbs,
      })),
    [permissionsKey],
  );

  const rbac = useAccessReview(namespace, permissions);

  const deniedPermissions = rbac.results.filter((r) => !r.allowed);
  const rbacBlocked = !rbac.loading && deniedPermissions.length > 0;

  const chartSource = useMemo(() => {
    const chart = quickstart.deployment?.chart;
    if (!chart) return null;
    if (chart.type === 'oci') {
      const ociRef = chart.ref;
      const registryPath = ociRef.replace(/^oci:\/\//, '');
      return { label: ociRef, url: `https://${registryPath}` };
    }
    if (chart.type === 'repo') {
      const repoUrl = quickstart.repository.replace(/\/$/, '');
      const chartPath = chart.path.replace(/\/$/, '');
      const branch = chart.branch ?? 'main';
      return {
        label: `${quickstart.repository} (${chart.path})`,
        url: `${repoUrl}/tree/${branch}/${chartPath}`,
      };
    }
    return { label: 'Unknown', url: undefined };
  }, [quickstart.deployment, quickstart.repository]);

  const installButton = rbac.loading ? (
    <Button variant="primary" isDisabled>
      <Spinner size="sm" aria-label="Checking permissions" />{' '}
      Checking permissions…
    </Button>
  ) : rbacBlocked ? (
    <Tooltip content="You lack required permissions in this namespace">
      <Button variant="primary" isDisabled>
        Install to {namespace}
      </Button>
    </Tooltip>
  ) : (
    <Button
      variant="primary"
      onClick={() => onInstall?.(quickstart)}
      isDisabled={!onInstall}
    >
      Install to {namespace}
    </Button>
  );

  return (
    <Modal
      variant="large"
      isOpen={isOpen}
      onClose={onClose}
      aria-label={`${quickstart.displayName ?? quickstart.name} details`}
    >
      <ModalHeader title={quickstart.displayName ?? quickstart.name} />
      <ModalBody>
        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
          {quickstart.description && (
            <FlexItem>
              <Content component="p">{quickstart.description}</Content>
            </FlexItem>
          )}
          <FlexItem>
            <div style={{
              display: 'grid',
              gridTemplateColumns: quickstart.image ? '2fr 1fr' : '1fr',
              gap: 'var(--pf-t--global--spacer--lg)',
              alignItems: 'start',
            }}>
              <DescriptionList isHorizontal isCompact>
                {quickstart.version && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Version</DescriptionListTerm>
                    <DescriptionListDescription>
                      {quickstart.version}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
                {quickstart.maintainer && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Maintainer</DescriptionListTerm>
                    <DescriptionListDescription>
                      {quickstart.maintainer.name}
                      {quickstart.maintainer.github &&
                        /^[a-zA-Z0-9-]+$/.test(quickstart.maintainer.github) && (
                          <>
                            {' '}
                            <a
                              href={`https://github.com/${quickstart.maintainer.github}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              @{quickstart.maintainer.github}
                            </a>
                          </>
                        )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
                <DescriptionListGroup>
                  <DescriptionListTerm>Repository</DescriptionListTerm>
                  <DescriptionListDescription>
                    {/^https?:\/\//.test(quickstart.repository) ? (
                      <a
                        href={quickstart.repository}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {quickstart.repository}{' '}
                        <ExternalLinkAltIcon />
                      </a>
                    ) : (
                      quickstart.repository
                    )}
                  </DescriptionListDescription>
                </DescriptionListGroup>
                {quickstart.deployment?.scope && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Scope</DescriptionListTerm>
                    <DescriptionListDescription>
                      <Label
                        color={
                          quickstart.deployment.scope === 'cluster'
                            ? 'orange'
                            : 'blue'
                        }
                      >
                        {quickstart.deployment.scope}
                      </Label>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
                {chartSource && (
                  <DescriptionListGroup>
                    <DescriptionListTerm>Chart source</DescriptionListTerm>
                    <DescriptionListDescription>
                      {chartSource.url ? (
                        <a
                          href={chartSource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {chartSource.label}{' '}
                          <ExternalLinkAltIcon />
                        </a>
                      ) : (
                        chartSource.label
                      )}
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                )}
              </DescriptionList>
              {quickstart.image && (
                <img
                  src={quickstart.image}
                  alt={quickstart.displayName ?? quickstart.name}
                  style={{ width: '100%', objectFit: 'contain', borderRadius: '4px' }}
                />
              )}
            </div>
          </FlexItem>

          {quickstart.prerequisites && quickstart.prerequisites.length > 0 && (
            <FlexItem>
              <Content component="h3">Prerequisites</Content>
              <List>
                {quickstart.prerequisites.map((p, idx) => (
                  <ListItem key={idx}>{p}</ListItem>
                ))}
              </List>
            </FlexItem>
          )}

          {quickstart.rbac?.requiredPermissions &&
            quickstart.rbac.requiredPermissions.length > 0 && (
              <FlexItem>
                <Content component="h3">Required permissions</Content>
                <List isPlain>
                  {quickstart.rbac.requiredPermissions.map((perm, idx) => (
                    <ListItem key={idx}>
                      <Flex
                        spaceItems={{ default: 'spaceItemsSm' }}
                        alignItems={{ default: 'alignItemsCenter' }}
                        flexWrap={{ default: 'nowrap' }}
                      >
                        <FlexItem>
                          {resourceDisplayName(perm.resource)}
                          {perm.apiGroup && ` (${perm.apiGroup})`}:
                        </FlexItem>
                        {perm.verbs.map((verb, verbIdx) => {
                          const result = rbac.results.find(
                            (r) =>
                              r.resource === perm.resource &&
                              r.group === perm.apiGroup &&
                              r.verb === verb,
                          );
                          let icon: React.ReactNode;
                          if (rbac.loading || !result) {
                            icon = (
                              <Spinner size="sm" aria-label={`Checking ${verb}`} />
                            );
                          } else if (result.allowed) {
                            icon = (
                              <CheckCircleIcon
                                color="var(--pf-t--global--color--status--success--default)"
                                aria-label={`${verb} allowed`}
                              />
                            );
                          } else {
                            icon = (
                              <TimesCircleIcon
                                color="var(--pf-t--global--color--status--danger--default)"
                                aria-label={`${verb} denied`}
                              />
                            );
                          }
                          const isLast = verbIdx === perm.verbs.length - 1;
                          return (
                            <FlexItem key={verb}>
                              <Flex
                                spaceItems={{ default: 'spaceItemsXs' }}
                                alignItems={{ default: 'alignItemsCenter' }}
                                flexWrap={{ default: 'nowrap' }}
                              >
                                <FlexItem>{verb}</FlexItem>
                                <FlexItem>{icon}</FlexItem>
                                {!isLast && <FlexItem>,</FlexItem>}
                              </Flex>
                            </FlexItem>
                          );
                        })}
                      </Flex>
                    </ListItem>
                  ))}
                </List>
              </FlexItem>
            )}

          {quickstart.tags && quickstart.tags.length > 0 && (
            <FlexItem>
              <LabelGroup categoryName="Tags">
                {quickstart.tags.map((tag) => (
                  <Label key={tag} variant="outline">
                    {tag}
                  </Label>
                ))}
              </LabelGroup>
            </FlexItem>
          )}
        </Flex>
      </ModalBody>
      <ModalFooter>
        {installButton}
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};

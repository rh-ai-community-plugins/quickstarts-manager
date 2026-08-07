import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  ExpandableSection,
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
import { QuickstartValuesForm } from './QuickstartValuesForm';
import {
  buildPayload,
  initialFormState,
  validateFields,
  type ValuesFormErrors,
  type ValuesFormState,
} from '~/app/utils/values';
import { ProjectSelector } from './ProjectSelector';

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
  namespace: string | null;
  isOpen: boolean;
  onClose: () => void;
  onInstall?: (
    quickstart: CatalogQuickstart,
    values?: Record<string, unknown>,
  ) => void;
  /** Change the target project from within the panel. */
  onSelectNamespace?: (namespace: string | null) => void;
  /** A quickstart is already deployed in the selected namespace. */
  alreadyDeployed?: boolean;
  /** The selected namespace's deployment status is still being checked. */
  namespaceStatusLoading?: boolean;
  /** The selected namespace is a protected/system namespace. */
  isProtectedNamespace?: boolean;
}

export const QuickstartDetailPanel: React.FC<QuickstartDetailPanelProps> = ({
  quickstart,
  namespace,
  isOpen,
  onClose,
  onInstall,
  onSelectNamespace,
  alreadyDeployed = false,
  namespaceStatusLoading = false,
  isProtectedNamespace = false,
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

  const configurableValues = quickstart.deployment?.configurableValues;

  const [valuesState, setValuesState] = useState<ValuesFormState>(() =>
    initialFormState(configurableValues),
  );
  const [valuesErrors, setValuesErrors] = useState<ValuesFormErrors>({});

  const quickstartName = quickstart.name;
  const configurableValuesKey = JSON.stringify(configurableValues);
  // Re-seed whenever the panel is opened for a different quickstart.
  useEffect(() => {
    setValuesState(initialFormState(configurableValues));
    setValuesErrors({});
  }, [quickstartName, configurableValuesKey]);

  const handleValueChange = (key: string, value: string | boolean) => {
    setValuesState((prev) => ({ ...prev, [key]: value }));
  };

  const handleInstallClick = () => {
    if (!configurableValues?.length) {
      onInstall?.(quickstart);
      return;
    }
    const errors = validateFields(configurableValues, valuesState);
    setValuesErrors(errors);
    if (Object.values(errors).some((error) => error)) {
      return;
    }
    onInstall?.(quickstart, buildPayload(configurableValues, valuesState));
  };

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

  let installControl: React.ReactNode;
  if (!namespace) {
    installControl = (
      <Button variant="primary" isDisabled>
        Install
      </Button>
    );
  } else if (isProtectedNamespace) {
    installControl = (
      <Tooltip content="Quickstarts cannot be installed into system namespaces. Choose another project.">
        <Button variant="primary" isDisabled>
          Install
        </Button>
      </Tooltip>
    );
  } else if (namespaceStatusLoading) {
    installControl = (
      <Button variant="primary" isDisabled>
        <Spinner size="sm" aria-label="Checking project" /> Checking project…
      </Button>
    );
  } else if (alreadyDeployed) {
    installControl = (
      <Tooltip content="A quickstart is already deployed in this project. Choose another project.">
        <Button variant="primary" isDisabled>
          Install
        </Button>
      </Tooltip>
    );
  } else if (rbac.loading) {
    installControl = (
      <Button variant="primary" isDisabled>
        <Spinner size="sm" aria-label="Checking permissions" /> Checking
        permissions…
      </Button>
    );
  } else if (rbacBlocked) {
    installControl = (
      <Tooltip content="You lack required permissions in this namespace">
        <Button variant="primary" isDisabled>
          Install
        </Button>
      </Tooltip>
    );
  } else {
    installControl = (
      <Button
        variant="primary"
        onClick={handleInstallClick}
        isDisabled={!onInstall}
      >
        Install
      </Button>
    );
  }

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

          {configurableValues && configurableValues.length > 0 && (
            <FlexItem>
              <ExpandableSection toggleText="Show advanced options">
                <QuickstartValuesForm
                  fields={configurableValues}
                  values={valuesState}
                  errors={valuesErrors}
                  onChange={handleValueChange}
                />
              </ExpandableSection>
            </FlexItem>
          )}
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Flex
          alignItems={{ default: 'alignItemsCenter' }}
          spaceItems={{ default: 'spaceItemsSm' }}
          flexWrap={{ default: 'wrap' }}
          style={{ width: '100%' }}
        >
          <FlexItem>
            <Content component="p">Install this Quickstart in:</Content>
          </FlexItem>
          <FlexItem>
            <ProjectSelector
              selectedProject={namespace}
              onSelect={onSelectNamespace ?? (() => undefined)}
              isDisabled={!onSelectNamespace}
            />
          </FlexItem>
          <FlexItem>{installControl}</FlexItem>
          <FlexItem align={{ default: 'alignRight' }}>
            <Button variant="link" onClick={onClose}>
              Cancel
            </Button>
          </FlexItem>
        </Flex>
      </ModalFooter>
    </Modal>
  );
};

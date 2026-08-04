import React, { useMemo } from 'react';
import {
  Alert,
  Button,
  Content,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  DrawerActions,
  DrawerCloseButton,
  DrawerHead,
  DrawerPanelContent,
  DrawerPanelBody,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
  List,
  ListItem,
  Spinner,
  Title,
  Tooltip,
} from '@patternfly/react-core';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
import { CatalogQuickstart } from '~/app/types/catalog';
import { useAccessReview } from '~/app/hooks/useAccessReview';
import type { PermissionCheck } from '~/app/hooks/useAccessReview';

export interface QuickstartDetailPanelProps {
  quickstart: CatalogQuickstart;
  namespace: string;
  onClose: () => void;
  onInstall?: (quickstart: CatalogQuickstart) => void;
}

export const QuickstartDetailPanel: React.FC<QuickstartDetailPanelProps> = ({
  quickstart,
  namespace,
  onClose,
  onInstall,
}) => {
  const permissions: PermissionCheck[] | undefined = useMemo(
    () =>
      quickstart.rbac?.requiredPermissions?.map((p) => ({
        apiGroup: p.apiGroup,
        resource: p.resource,
        verbs: p.verbs,
      })),
    [quickstart.rbac?.requiredPermissions],
  );

  const rbac = useAccessReview(namespace, permissions);

  const deniedPermissions = rbac.results.filter((r) => !r.allowed);
  const rbacBlocked = !rbac.loading && deniedPermissions.length > 0;

  const chartSource =
    quickstart.deployment?.chart.type === 'oci'
      ? quickstart.deployment.chart.ref
      : quickstart.deployment?.chart.type === 'repo'
        ? `${quickstart.repository} (${quickstart.deployment.chart.path})`
        : 'Unknown';

  return (
    <DrawerPanelContent widths={{ default: 'width_33', lg: 'width_33' }}>
      <DrawerHead>
        <Title headingLevel="h2">
          {quickstart.displayName ?? quickstart.name}
        </Title>
        <DrawerActions>
          <DrawerCloseButton onClick={onClose} />
        </DrawerActions>
      </DrawerHead>
      <DrawerPanelBody>
        <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsMd' }}>
          {quickstart.description && (
            <FlexItem>
              <Content component="p">{quickstart.description}</Content>
            </FlexItem>
          )}

          <FlexItem>
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
              {quickstart.deployment && (
                <DescriptionListGroup>
                  <DescriptionListTerm>Chart source</DescriptionListTerm>
                  <DescriptionListDescription>
                    {chartSource}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}
            </DescriptionList>
          </FlexItem>

          {quickstart.prerequisites && quickstart.prerequisites.length > 0 && (
            <FlexItem>
              <Title headingLevel="h3">Prerequisites</Title>
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
                <Title headingLevel="h3">Required permissions</Title>
                <List>
                  {quickstart.rbac.requiredPermissions.map((perm, idx) => (
                    <ListItem
                      key={idx}
                    >
                      {perm.resource}
                      {perm.apiGroup && ` (${perm.apiGroup})`}:{' '}
                      {perm.verbs.join(', ')}
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

          {rbacBlocked && (
            <FlexItem>
              <Alert
                variant="danger"
                title="Insufficient permissions"
                isInline
                isPlain
              >
                <List isPlain>
                  {deniedPermissions.map((p) => (
                    <ListItem key={`${p.group}/${p.resource}/${p.verb}`}>
                      {p.resource}
                      {p.group && ` (${p.group})`}: {p.verb}
                    </ListItem>
                  ))}
                </List>
              </Alert>
            </FlexItem>
          )}

          <FlexItem>
            {rbac.loading ? (
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
            )}
          </FlexItem>
        </Flex>
      </DrawerPanelBody>
    </DrawerPanelContent>
  );
};

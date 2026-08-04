import React from 'react';
import {
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
  Title,
} from '@patternfly/react-core';
import { ExternalLinkAltIcon } from '@patternfly/react-icons';
import { CatalogQuickstart } from '~/app/types/catalog';

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
                  <a
                    href={quickstart.repository}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {quickstart.repository}{' '}
                    <ExternalLinkAltIcon />
                  </a>
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

          <FlexItem>
            <Button
              variant="primary"
              onClick={() => onInstall?.(quickstart)}
              isDisabled={!onInstall}
            >
              Install to {namespace}
            </Button>
          </FlexItem>
        </Flex>
      </DrawerPanelBody>
    </DrawerPanelContent>
  );
};

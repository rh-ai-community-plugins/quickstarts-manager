import React from 'react';
import {
  Button,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Flex,
  FlexItem,
  Label,
  List,
  ListItem,
  Title,
} from '@patternfly/react-core';
import {
  ExternalLinkAltIcon,
  SyncAltIcon,
} from '@patternfly/react-icons';
import type { QuickstartStatusResponse } from '~/app/types/status';

export interface StatusViewProps {
  status: QuickstartStatusResponse;
  catalogVersion?: string;
  namespace: string;
  onUpgrade: () => void;
  onRemove: () => void;
  onRefresh: () => void;
  isLifecycleLoading: boolean;
}

function statusColor(
  status: string,
): 'green' | 'red' | 'blue' | 'orange' | 'grey' {
  switch (status) {
    case 'deployed':
      return 'green';
    case 'failed':
      return 'red';
    case 'pending-install':
    case 'pending-upgrade':
    case 'pending-rollback':
      return 'blue';
    case 'uninstalling':
      return 'orange';
    default:
      return 'grey';
  }
}

function extractChartVersion(chart: string): string {
  const parts = chart.split('-');
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d/.test(parts[i])) {
      return parts.slice(i).join('-');
    }
  }
  return chart;
}

export const StatusView: React.FC<StatusViewProps> = ({
  status,
  catalogVersion,
  namespace,
  onUpgrade,
  onRemove,
  onRefresh,
  isLifecycleLoading,
}) => {
  const { release, routes } = status;
  const installedVersion = extractChartVersion(release.chart);
  const upgradeAvailable =
    !!catalogVersion && catalogVersion !== installedVersion;

  return (
    <>
      <Flex
        alignItems={{ default: 'alignItemsCenter' }}
        gap={{ default: 'gapMd' }}
        className="pf-v6-u-mb-lg"
      >
        <FlexItem>
          <Title headingLevel="h2">{release.name}</Title>
        </FlexItem>
        <FlexItem>
          <Label color={statusColor(release.status)}>{release.status}</Label>
        </FlexItem>
      </Flex>

      <DescriptionList isHorizontal className="pf-v6-u-mb-lg">
        <DescriptionListGroup>
          <DescriptionListTerm>Namespace</DescriptionListTerm>
          <DescriptionListDescription>{namespace}</DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Chart</DescriptionListTerm>
          <DescriptionListDescription>
            {release.chart}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>App Version</DescriptionListTerm>
          <DescriptionListDescription>
            {release.appVersion}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>Installed Version</DescriptionListTerm>
          <DescriptionListDescription>
            <Flex
              alignItems={{ default: 'alignItemsCenter' }}
              gap={{ default: 'gapSm' }}
            >
              <FlexItem>{installedVersion}</FlexItem>
              {upgradeAvailable && (
                <FlexItem>
                  <Label color="blue" isCompact>
                    Update available: {catalogVersion}
                  </Label>
                </FlexItem>
              )}
            </Flex>
          </DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>

      {routes.length > 0 && (
        <div className="pf-v6-u-mb-lg">
          <Title headingLevel="h3" className="pf-v6-u-mb-sm">
            Application Routes
          </Title>
          <List isPlain>
            {routes.map((route) => (
              <ListItem key={route.name}>
                <Button
                  variant="link"
                  isInline
                  component="a"
                  href={route.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  icon={<ExternalLinkAltIcon />}
                  iconPosition="end"
                >
                  {route.name}
                </Button>
              </ListItem>
            ))}
          </List>
        </div>
      )}

      <Flex gap={{ default: 'gapSm' }}>
        {upgradeAvailable && (
          <FlexItem>
            <Button
              variant="primary"
              onClick={onUpgrade}
              isDisabled={isLifecycleLoading}
            >
              Upgrade
            </Button>
          </FlexItem>
        )}
        <FlexItem>
          <Button
            variant="danger"
            onClick={onRemove}
            isDisabled={isLifecycleLoading}
          >
            Remove
          </Button>
        </FlexItem>
        <FlexItem>
          <Button
            variant="plain"
            aria-label="Refresh status"
            onClick={onRefresh}
          >
            <SyncAltIcon />
          </Button>
        </FlexItem>
      </Flex>
    </>
  );
};

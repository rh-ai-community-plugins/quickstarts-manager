import React from 'react';
import {
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Flex,
  FlexItem,
  Skeleton,
} from '@patternfly/react-core';

export const StatusSkeleton: React.FC = () => (
  <>
    <Flex
      alignItems={{ default: 'alignItemsCenter' }}
      gap={{ default: 'gapMd' }}
      className="pf-v6-u-mb-lg"
    >
      <FlexItem>
        <Skeleton width="200px" height="28px" screenreaderText="Loading quickstart status" />
      </FlexItem>
      <FlexItem>
        <Skeleton width="80px" height="22px" />
      </FlexItem>
    </Flex>

    <DescriptionList isHorizontal className="pf-v6-u-mb-lg">
      {['Namespace', 'Chart', 'App Version', 'Installed Version'].map(
        (term) => (
          <DescriptionListGroup key={term}>
            <DescriptionListTerm>{term}</DescriptionListTerm>
            <DescriptionListDescription>
              <Skeleton width="150px" height="16px" />
            </DescriptionListDescription>
          </DescriptionListGroup>
        ),
      )}
    </DescriptionList>

    <Flex gap={{ default: 'gapSm' }}>
      <FlexItem>
        <Skeleton width="90px" height="36px" />
      </FlexItem>
      <FlexItem>
        <Skeleton width="90px" height="36px" />
      </FlexItem>
    </Flex>
  </>
);

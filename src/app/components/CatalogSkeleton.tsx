import React from 'react';
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Gallery,
  GalleryItem,
  Skeleton,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';

const PLACEHOLDER_COUNT = 6;

export const CatalogSkeleton: React.FC = () => (
  <>
    <Toolbar>
      <ToolbarContent>
        <ToolbarItem style={{ minWidth: '300px' }}>
          <Skeleton height="36px" width="100%" screenreaderText="Loading catalog search" />
        </ToolbarItem>
      </ToolbarContent>
    </Toolbar>
    <Gallery hasGutter minWidths={{ default: '300px' }}>
      {Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
        <GalleryItem key={i}>
          <Card isFullHeight>
            <CardHeader>
              <Skeleton width="60%" height="24px" />
            </CardHeader>
            <CardBody>
              <Skeleton width="100%" height="16px" />
              <br />
              <Skeleton width="80%" height="16px" />
              <br />
              <Skeleton width="30%" height="14px" />
            </CardBody>
            <CardFooter>
              <Skeleton width="40%" height="22px" />
            </CardFooter>
          </Card>
        </GalleryItem>
      ))}
    </Gallery>
  </>
);

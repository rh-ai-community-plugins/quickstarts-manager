import React, { useState, useMemo } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Drawer,
  DrawerContent,
  DrawerContentBody,
  EmptyState,
  EmptyStateBody,
  EmptyStateFooter,
  EmptyStateActions,
  Gallery,
  GalleryItem,
  Label,
  LabelGroup,
  SearchInput,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  ToolbarGroup,
  Content,
} from '@patternfly/react-core';
import { SyncAltIcon } from '@patternfly/react-icons';
import { CatalogQuickstart } from '~/app/types/catalog';
import { CatalogSkeleton } from './CatalogSkeleton';
import { QuickstartDetailPanel } from './QuickstartDetailPanel';

export interface CatalogViewProps {
  quickstarts: CatalogQuickstart[];
  loading: boolean;
  error: string | null;
  onRefresh: (bypassCache?: boolean) => void;
  namespace: string;
  onInstall?: (quickstart: CatalogQuickstart) => void;
}

export const CatalogView: React.FC<CatalogViewProps> = ({
  quickstarts,
  loading,
  error,
  onRefresh,
  namespace,
  onInstall,
}) => {
  const [searchText, setSearchText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedQuickstart, setSelectedQuickstart] =
    useState<CatalogQuickstart | null>(null);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    quickstarts.forEach((q) => q.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [quickstarts]);

  const filteredQuickstarts = useMemo(() => {
    const needle = searchText.toLowerCase();
    return quickstarts.filter((q) => {
      if (needle) {
        const nameMatch = (q.displayName ?? q.name)
          .toLowerCase()
          .includes(needle);
        const descMatch = (q.description ?? '').toLowerCase().includes(needle);
        if (!nameMatch && !descMatch) return false;
      }
      if (selectedTags.length > 0) {
        if (!selectedTags.some((tag) => q.tags?.includes(tag))) return false;
      }
      return true;
    });
  }, [quickstarts, searchText, selectedTags]);

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const handleClearFilters = () => {
    setSearchText('');
    setSelectedTags([]);
  };

  if (loading && quickstarts.length === 0) {
    return <CatalogSkeleton />;
  }

  if (error && quickstarts.length === 0) {
    return (
      <EmptyState
        headingLevel="h2"
        titleText="Unable to load catalog"
        icon={SyncAltIcon}
      >
        <EmptyStateBody>{error}</EmptyStateBody>
        <EmptyStateFooter>
          <EmptyStateActions>
            <Button variant="primary" onClick={() => onRefresh(true)}>
              Retry
            </Button>
          </EmptyStateActions>
        </EmptyStateFooter>
      </EmptyState>
    );
  }

  const toolbar = (
    <Toolbar>
      <ToolbarContent>
        <ToolbarItem style={{ minWidth: '300px' }}>
          <SearchInput
            placeholder="Search by name or description"
            value={searchText}
            onChange={(_event, value) => setSearchText(value)}
            onClear={() => setSearchText('')}
            aria-label="Search quickstarts"
          />
        </ToolbarItem>
        {allTags.length > 0 && (
          <ToolbarGroup>
            <ToolbarItem>
              <LabelGroup categoryName="Tags" numLabels={10}>
                {allTags.map((tag) => (
                  <Label
                    key={tag}
                    color={selectedTags.includes(tag) ? 'blue' : 'grey'}
                    onClick={() => handleTagToggle(tag)}
                    variant={selectedTags.includes(tag) ? 'filled' : 'outline'}
                  >
                    {tag}
                  </Label>
                ))}
              </LabelGroup>
            </ToolbarItem>
          </ToolbarGroup>
        )}
        <ToolbarItem align={{ default: 'alignEnd' }}>
          <Button
            variant="plain"
            aria-label="Refresh catalog"
            onClick={() => onRefresh(true)}
            isLoading={loading}
          >
            <SyncAltIcon />
          </Button>
        </ToolbarItem>
      </ToolbarContent>
    </Toolbar>
  );

  const catalogContent = (
    <>
      {toolbar}
      {filteredQuickstarts.length === 0 ? (
        <EmptyState headingLevel="h2" titleText="No quickstarts found">
          <EmptyStateBody>
            {quickstarts.length === 0
              ? 'The catalog is empty. Check the registry configuration.'
              : 'No quickstarts match the current filters.'}
          </EmptyStateBody>
          {(searchText || selectedTags.length > 0) && (
            <EmptyStateFooter>
              <EmptyStateActions>
                <Button variant="link" onClick={handleClearFilters}>
                  Clear all filters
                </Button>
              </EmptyStateActions>
            </EmptyStateFooter>
          )}
        </EmptyState>
      ) : (
        <Gallery hasGutter minWidths={{ default: '300px' }}>
          {filteredQuickstarts.map((q) => (
            <GalleryItem key={q.name}>
              <Card
                isClickable
                isFullHeight
                isSelected={selectedQuickstart?.name === q.name}
              >
                <CardHeader
                  selectableActions={{
                    onClickAction: () => setSelectedQuickstart(q),
                    selectableActionId: `select-${q.name}`,
                    selectableActionAriaLabelledby: `title-${q.name}`,
                    name: 'quickstart-card',
                  }}
                >
                  <CardTitle id={`title-${q.name}`}>
                    {q.displayName ?? q.name}
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <Content component="p">
                    {q.metadataAvailable
                      ? q.description ?? 'No description available.'
                      : 'Metadata unavailable'}
                  </Content>
                  {q.version && (
                    <Content component="small">v{q.version}</Content>
                  )}
                </CardBody>
                <CardFooter>
                  <LabelGroup>
                    {q.deployment?.scope && (
                      <Label
                        color={
                          q.deployment.scope === 'cluster' ? 'orange' : 'blue'
                        }
                      >
                        {q.deployment.scope}
                      </Label>
                    )}
                    {q.tags?.map((tag) => (
                      <Label key={tag} variant="outline">
                        {tag}
                      </Label>
                    ))}
                  </LabelGroup>
                </CardFooter>
              </Card>
            </GalleryItem>
          ))}
        </Gallery>
      )}
    </>
  );

  return (
    <Drawer isExpanded={selectedQuickstart !== null}>
      <DrawerContent
        panelContent={
          selectedQuickstart ? (
            <QuickstartDetailPanel
              quickstart={selectedQuickstart}
              namespace={namespace}
              onClose={() => setSelectedQuickstart(null)}
              onInstall={onInstall}
            />
          ) : undefined
        }
      >
        <DrawerContentBody>{catalogContent}</DrawerContentBody>
      </DrawerContent>
    </Drawer>
  );
};

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogView } from '../CatalogView';
import { CatalogQuickstart } from '~/app/types/catalog';

jest.mock('../QuickstartDetailPanel', () => ({
  QuickstartDetailPanel: ({
    quickstart,
    onClose,
  }: {
    quickstart: CatalogQuickstart;
    namespace: string;
    onClose: () => void;
  }) => (
    <div data-testid="detail-panel">
      <span data-testid="detail-name">{quickstart.displayName}</span>
      <button data-testid="detail-close" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

const mockQuickstarts: CatalogQuickstart[] = [
  {
    name: 'lemonade-stand',
    repository: 'https://github.com/example/lemonade',
    metadataAvailable: true,
    displayName: 'Lemonade Stand',
    description: 'A demo chatbot assistant',
    version: '1.0.0',
    tags: ['chatbot', 'demo'],
    deployment: {
      scope: 'project',
      chart: { type: 'oci', ref: 'oci://quay.io/example/lemonade' },
    },
  },
  {
    name: 'rag-pipeline',
    repository: 'https://github.com/example/rag',
    metadataAvailable: true,
    displayName: 'RAG Pipeline',
    description: 'Retrieval augmented generation',
    version: '2.0.0',
    tags: ['rag', 'llm'],
    deployment: {
      scope: 'cluster',
      chart: { type: 'oci', ref: 'oci://quay.io/example/rag' },
    },
  },
  {
    name: 'no-metadata',
    repository: 'https://github.com/example/broken',
    metadataAvailable: false,
  },
];

describe('CatalogView', () => {
  const onRefresh = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should render quickstart cards', () => {
    render(
      <CatalogView
        quickstarts={mockQuickstarts}
        loading={false}
        error={null}
        onRefresh={onRefresh}
        namespace="test-ns"
      />,
    );

    expect(screen.getByText('Lemonade Stand')).toBeInTheDocument();
    expect(screen.getByText('RAG Pipeline')).toBeInTheDocument();
    expect(screen.getByText('no-metadata')).toBeInTheDocument();
  });

  it('should show skeleton loading state when loading with no data', () => {
    render(
      <CatalogView
        quickstarts={[]}
        loading={true}
        error={null}
        onRefresh={onRefresh}
        namespace="test-ns"
      />,
    );

    expect(screen.getByText('Loading catalog search')).toBeInTheDocument();
  });

  it('should show error state with retry button', async () => {
    const user = userEvent.setup();
    render(
      <CatalogView
        quickstarts={[]}
        loading={false}
        error="Service unavailable"
        onRefresh={onRefresh}
        namespace="test-ns"
      />,
    );

    expect(screen.getByText('Unable to load catalog')).toBeInTheDocument();
    expect(screen.getByText('Service unavailable')).toBeInTheDocument();

    await user.click(screen.getByText('Retry'));
    expect(onRefresh).toHaveBeenCalledWith(true);
  });

  it('should show empty state when catalog is empty', () => {
    render(
      <CatalogView
        quickstarts={[]}
        loading={false}
        error={null}
        onRefresh={onRefresh}
        namespace="test-ns"
      />,
    );

    expect(screen.getByText('No quickstarts found')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The catalog is empty. Check the registry configuration.',
      ),
    ).toBeInTheDocument();
  });

  it('should filter by search text', async () => {
    const user = userEvent.setup();
    render(
      <CatalogView
        quickstarts={mockQuickstarts}
        loading={false}
        error={null}
        onRefresh={onRefresh}
        namespace="test-ns"
      />,
    );

    const searchInput = screen.getByPlaceholderText(
      'Search by name or description',
    );
    await user.type(searchInput, 'lemonade');

    expect(screen.getByText('Lemonade Stand')).toBeInTheDocument();
    expect(screen.queryByText('RAG Pipeline')).not.toBeInTheDocument();
  });

  it('should filter by tags', async () => {
    const user = userEvent.setup();
    render(
      <CatalogView
        quickstarts={mockQuickstarts}
        loading={false}
        error={null}
        onRefresh={onRefresh}
        namespace="test-ns"
      />,
    );

    const toolbar = screen.getByLabelText('Tags').closest('.pf-v6-c-label-group') as HTMLElement;
    expect(toolbar).toBeTruthy();
    const ragLabel = within(toolbar).getByText('rag');
    await user.click(ragLabel);

    expect(screen.getByText('RAG Pipeline')).toBeInTheDocument();
    expect(screen.queryByText('Lemonade Stand')).not.toBeInTheDocument();
  });

  it('should show deployment scope labels', () => {
    render(
      <CatalogView
        quickstarts={mockQuickstarts}
        loading={false}
        error={null}
        onRefresh={onRefresh}
        namespace="test-ns"
      />,
    );

    expect(screen.getByText('project')).toBeInTheDocument();
    expect(screen.getByText('cluster')).toBeInTheDocument();
  });

  it('should show "Metadata unavailable" for quickstarts without metadata', () => {
    render(
      <CatalogView
        quickstarts={mockQuickstarts}
        loading={false}
        error={null}
        onRefresh={onRefresh}
        namespace="test-ns"
      />,
    );

    expect(screen.getByText('Metadata unavailable')).toBeInTheDocument();
  });

  it('should show clear filters button when no results match filters', async () => {
    const user = userEvent.setup();
    render(
      <CatalogView
        quickstarts={mockQuickstarts}
        loading={false}
        error={null}
        onRefresh={onRefresh}
        namespace="test-ns"
      />,
    );

    const searchInput = screen.getByPlaceholderText(
      'Search by name or description',
    );
    await user.type(searchInput, 'nonexistent');

    expect(screen.getByText('No quickstarts found')).toBeInTheDocument();
    expect(screen.getByText('Clear all filters')).toBeInTheDocument();
  });

  it('should call refresh when refresh button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <CatalogView
        quickstarts={mockQuickstarts}
        loading={false}
        error={null}
        onRefresh={onRefresh}
        namespace="test-ns"
      />,
    );

    await user.click(screen.getByLabelText('Refresh catalog'));
    expect(onRefresh).toHaveBeenCalledWith(true);
  });
});

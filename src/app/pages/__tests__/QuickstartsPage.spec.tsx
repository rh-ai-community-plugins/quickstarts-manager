import { render, screen, fireEvent } from '@testing-library/react';
import QuickstartsPage from '../QuickstartsPage';

jest.mock('~/app/components/ProjectSelector', () => ({
  ProjectSelector: ({
    selectedProject,
    onSelect,
  }: {
    selectedProject: string | null;
    onSelect: (p: string | null) => void;
  }) => (
    <div data-testid="project-selector">
      {selectedProject ?? 'none'}
      <button
        data-testid="select-project"
        onClick={() => onSelect('test-project')}
      >
        Select
      </button>
      <button
        data-testid="clear-project"
        onClick={() => onSelect(null)}
      >
        Clear
      </button>
    </div>
  ),
}));

jest.mock('~/app/hooks/useLastSelectedProject', () => ({
  useLastSelectedProject: () => [null, jest.fn()],
}));

const mockCatalog = {
  quickstarts: [
    {
      name: 'demo-app',
      repository: 'https://github.com/example/demo',
      metadataAvailable: true,
      displayName: 'Demo App',
      description: 'A demo application',
    },
  ],
  loading: false,
  error: null,
  refresh: jest.fn(),
};

const mockStatusHook = {
  status: null as null | { release: { name: string; namespace: string; status: string; chart: string; appVersion: string }; routes: never[] },
  loading: false,
  error: null as string | null,
  refresh: jest.fn(),
};

jest.mock('~/app/hooks/useQuickstartCatalog', () => ({
  useQuickstartCatalog: () => mockCatalog,
}));

jest.mock('~/app/hooks/useQuickstartStatus', () => ({
  useQuickstartStatus: () => mockStatusHook,
}));

jest.mock('~/app/components/CatalogView', () => ({
  CatalogView: ({ namespace }: { namespace: string }) => (
    <div data-testid="catalog-view">Catalog for {namespace}</div>
  ),
}));

describe('QuickstartsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatusHook.status = null;
    mockStatusHook.loading = false;
    mockStatusHook.error = null;
  });

  it('should render the project selector', () => {
    render(<QuickstartsPage />);
    expect(screen.getByTestId('project-selector')).toBeInTheDocument();
  });

  it('should show prompt to select a project when none is selected', () => {
    render(<QuickstartsPage />);
    expect(screen.getByText(/select a project/i)).toBeInTheDocument();
  });

  it('should show catalog view when namespace has no deployed quickstart', () => {
    render(<QuickstartsPage />);
    fireEvent.click(screen.getByTestId('select-project'));

    expect(screen.getByTestId('catalog-view')).toBeInTheDocument();
    expect(screen.getByText('Catalog for test-project')).toBeInTheDocument();
  });

  it('should show status placeholder when namespace has a deployed quickstart', () => {
    mockStatusHook.status = {
      release: {
        name: 'my-app',
        namespace: 'test-project',
        status: 'deployed',
        chart: 'my-app-1.0.0',
        appVersion: '1.0.0',
      },
      routes: [],
    };

    render(<QuickstartsPage />);
    fireEvent.click(screen.getByTestId('select-project'));

    expect(screen.getByText('Quickstart deployed')).toBeInTheDocument();
    expect(screen.getByText('Quickstart deployed')).toBeInTheDocument();
  });

  it('should show spinner while checking status', () => {
    mockStatusHook.loading = true;

    render(<QuickstartsPage />);
    fireEvent.click(screen.getByTestId('select-project'));

    expect(
      screen.getByLabelText('Checking namespace status'),
    ).toBeInTheDocument();
  });

  it('should show warning when status check fails', () => {
    mockStatusHook.error = 'Connection refused';

    render(<QuickstartsPage />);
    fireEvent.click(screen.getByTestId('select-project'));

    expect(
      screen.getByText('Could not check namespace status'),
    ).toBeInTheDocument();
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });
});

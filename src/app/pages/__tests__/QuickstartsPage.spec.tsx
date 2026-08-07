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
        data-testid="select-protected"
        onClick={() => onSelect('kube-system')}
      >
        Select Protected
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
      version: '1.0.0',
    },
  ],
  loading: false,
  error: null,
  refresh: jest.fn(),
};

const mockStatusHook = {
  status: null as null | {
    release: {
      name: string;
      namespace: string;
      status: string;
      chart: string;
      appVersion: string;
    };
    routes: Array<{ name: string; url: string }>;
  },
  loading: false,
  error: null as string | null,
  refresh: jest.fn(),
};

const mockLifecycle = {
  loading: false,
  operation: null,
  steps: [],
  result: null,
  error: null,
  install: jest.fn(),
  upgrade: jest.fn(),
  remove: jest.fn(),
  reset: jest.fn(),
};

jest.mock('~/app/hooks/useQuickstartCatalog', () => ({
  useQuickstartCatalog: () => mockCatalog,
}));

jest.mock('~/app/hooks/useQuickstartStatus', () => ({
  useQuickstartStatus: () => mockStatusHook,
}));

jest.mock('~/app/hooks/useQuickstartLifecycle', () => ({
  useQuickstartLifecycle: () => mockLifecycle,
}));

jest.mock('~/app/components/CatalogView', () => ({
  CatalogView: ({
    onSelectQuickstart,
  }: {
    onSelectQuickstart: (q: { name: string }) => void;
  }) => (
    <div data-testid="catalog-view">
      Catalog
      <button
        data-testid="open-detail"
        onClick={() => onSelectQuickstart({ name: 'demo-app' })}
      >
        Open detail
      </button>
    </div>
  ),
}));

jest.mock('~/app/components/QuickstartDetailPanel', () => ({
  QuickstartDetailPanel: ({
    namespace,
    onInstall,
    isProtectedNamespace,
    alreadyDeployed,
  }: {
    namespace: string | null;
    onInstall?: () => void;
    isProtectedNamespace?: boolean;
    alreadyDeployed?: boolean;
  }) => (
    <div data-testid="detail-panel">
      Install in {namespace}
      {onInstall && !isProtectedNamespace && !alreadyDeployed ? (
        <span data-testid="install-enabled">install enabled</span>
      ) : (
        <span data-testid="install-disabled">install disabled</span>
      )}
    </div>
  ),
}));

jest.mock('~/app/components/StatusView', () => ({
  StatusView: ({ namespace }: { namespace: string }) => (
    <div data-testid="status-view">Status for {namespace}</div>
  ),
}));

jest.mock('~/app/components/StatusSkeleton', () => ({
  StatusSkeleton: () => <div data-testid="status-skeleton">Loading status...</div>,
}));

jest.mock('~/app/components/LifecycleProgressModal', () => ({
  __esModule: true,
  default: () => <div data-testid="progress-modal" />,
}));

jest.mock('~/app/components/RemoveQuickstartModal', () => ({
  __esModule: true,
  default: () => <div data-testid="remove-modal" />,
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
    expect(screen.getAllByText(/select a project/i).length).toBeGreaterThanOrEqual(1);
  });

  it('should show catalog view when namespace has no deployed quickstart', () => {
    render(<QuickstartsPage />);
    fireEvent.click(screen.getByTestId('select-project'));

    expect(screen.getByTestId('catalog-view')).toBeInTheDocument();
  });

  it('should open the detail panel targeting the selected namespace', () => {
    render(<QuickstartsPage />);
    fireEvent.click(screen.getByTestId('select-project'));
    fireEvent.click(screen.getByTestId('open-detail'));

    expect(screen.getByTestId('detail-panel')).toBeInTheDocument();
    expect(screen.getByText('Install in test-project')).toBeInTheDocument();
  });

  it('should show status view when namespace has a deployed quickstart', () => {
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

    expect(screen.getByTestId('status-view')).toBeInTheDocument();
    expect(screen.getByText('Status for test-project')).toBeInTheDocument();
  });

  it('should show skeleton while checking status', () => {
    mockStatusHook.loading = true;

    render(<QuickstartsPage />);
    fireEvent.click(screen.getByTestId('select-project'));

    expect(screen.getByTestId('status-skeleton')).toBeInTheDocument();
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

  it('should render progress and remove modals', () => {
    render(<QuickstartsPage />);
    expect(screen.getByTestId('progress-modal')).toBeInTheDocument();
    expect(screen.getByTestId('remove-modal')).toBeInTheDocument();
  });

  it('should show warning and disable install for protected namespaces', () => {
    render(<QuickstartsPage />);
    fireEvent.click(screen.getByTestId('select-protected'));

    expect(screen.getByText('Protected namespace')).toBeInTheDocument();
    expect(screen.getByText(/Installing quickstarts into system namespaces is not allowed/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('open-detail'));
    expect(screen.getByTestId('install-disabled')).toBeInTheDocument();
  });

  it('should enable install for non-protected namespaces', () => {
    render(<QuickstartsPage />);
    fireEvent.click(screen.getByTestId('select-project'));
    fireEvent.click(screen.getByTestId('open-detail'));

    expect(screen.queryByText('Protected namespace')).not.toBeInTheDocument();
    expect(screen.getByTestId('install-enabled')).toBeInTheDocument();
  });

  it('should keep the detail panel mounted and update gating when the project changes from within it', () => {
    render(<QuickstartsPage />);
    fireEvent.click(screen.getByTestId('select-project'));
    fireEvent.click(screen.getByTestId('open-detail'));

    // Panel open, targeting a non-protected project → install enabled.
    expect(screen.getByText('Install in test-project')).toBeInTheDocument();
    expect(screen.getByTestId('install-enabled')).toBeInTheDocument();

    // Switch to a protected project WITHOUT reopening the panel.
    fireEvent.click(screen.getByTestId('select-protected'));

    // Panel survived the content swap and its gating updated live.
    expect(screen.getByTestId('detail-panel')).toBeInTheDocument();
    expect(screen.getByText('Install in kube-system')).toBeInTheDocument();
    expect(screen.getByTestId('install-disabled')).toBeInTheDocument();
  });
});

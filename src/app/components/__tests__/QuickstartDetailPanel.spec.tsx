import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickstartDetailPanel } from '../QuickstartDetailPanel';
import { CatalogQuickstart } from '~/app/types/catalog';

const mockAccessReview = {
  results: [] as Array<{ verb: string; resource: string; group: string; allowed: boolean }>,
  loading: false,
  error: null as string | null,
};

jest.mock('~/app/hooks/useAccessReview', () => ({
  useAccessReview: () => mockAccessReview,
}));

jest.mock('../ProjectSelector', () => ({
  ProjectSelector: ({ selectedProject }: { selectedProject: string | null }) => (
    <div data-testid="project-selector">{selectedProject ?? 'none'}</div>
  ),
}));

const fullQuickstart: CatalogQuickstart = {
  name: 'lemonade-stand',
  repository: 'https://github.com/example/lemonade',
  metadataAvailable: true,
  displayName: 'Lemonade Stand Assistant',
  description: 'An AI-powered chatbot for ordering lemonade.',
  version: '1.2.0',
  maintainer: { name: 'Jane Doe', github: 'janedoe' },
  deployment: {
    scope: 'project',
    chart: { type: 'oci', ref: 'oci://quay.io/example/lemonade-chart' },
  },
  rbac: {
    requiredPermissions: [
      {
        apiGroup: 'apps',
        resource: 'deployments',
        verbs: ['create', 'delete'],
      },
      { apiGroup: '', resource: 'services', verbs: ['create'] },
    ],
  },
  prerequisites: ['GPU node available', 'At least 8Gi memory'],
  tags: ['chatbot', 'demo'],
};

const minimalQuickstart: CatalogQuickstart = {
  name: 'basic-app',
  repository: 'https://github.com/example/basic',
  metadataAvailable: true,
  version: '0.1.0',
};

const renderPanel = (
  quickstart: CatalogQuickstart = fullQuickstart,
  onInstall?: (q: CatalogQuickstart) => void,
  extraProps: Partial<
    React.ComponentProps<typeof QuickstartDetailPanel>
  > = {},
) => {
  return render(
    <QuickstartDetailPanel
      quickstart={quickstart}
      namespace="my-namespace"
      isOpen
      onClose={jest.fn()}
      onInstall={onInstall}
      {...extraProps}
    />,
  );
};

describe('QuickstartDetailPanel', () => {
  beforeEach(() => {
    mockAccessReview.results = [];
    mockAccessReview.loading = false;
    mockAccessReview.error = null;
  });

  it('should render display name and description', () => {
    renderPanel();

    expect(screen.getByText('Lemonade Stand Assistant')).toBeInTheDocument();
    expect(
      screen.getByText('An AI-powered chatbot for ordering lemonade.'),
    ).toBeInTheDocument();
  });

  it('should render version', () => {
    renderPanel();
    expect(screen.getByText('1.2.0')).toBeInTheDocument();
  });

  it('should render maintainer with GitHub link', () => {
    renderPanel();
    expect(screen.getByText('@janedoe')).toBeInTheDocument();
    expect(screen.getByText('@janedoe').closest('a')).toHaveAttribute(
      'href',
      'https://github.com/janedoe',
    );
  });

  it('should render repository link', () => {
    renderPanel();
    const repoLink = screen.getByText(
      'https://github.com/example/lemonade',
      { exact: false },
    );
    expect(repoLink.closest('a')).toHaveAttribute(
      'href',
      'https://github.com/example/lemonade',
    );
  });

  it('should render deployment scope', () => {
    renderPanel();
    expect(screen.getByText('project')).toBeInTheDocument();
  });

  it('should render chart source for OCI', () => {
    renderPanel();
    expect(
      screen.getByText('oci://quay.io/example/lemonade-chart'),
    ).toBeInTheDocument();
  });

  it('should render prerequisites', () => {
    renderPanel();
    expect(screen.getByText('Prerequisites')).toBeInTheDocument();
    expect(screen.getByText('GPU node available')).toBeInTheDocument();
    expect(screen.getByText('At least 8Gi memory')).toBeInTheDocument();
  });

  it('should render required permissions with display names and verbs', () => {
    renderPanel();
    expect(screen.getByText('Required permissions')).toBeInTheDocument();
    expect(screen.getByText('Deployments (apps):')).toBeInTheDocument();
    expect(screen.getByText('Services:')).toBeInTheDocument();
    expect(screen.getAllByText('create')).toHaveLength(2);
    expect(screen.getByText('delete')).toBeInTheDocument();
  });

  it('should render tags', () => {
    renderPanel();
    expect(screen.getByText('chatbot')).toBeInTheDocument();
    expect(screen.getByText('demo')).toBeInTheDocument();
  });

  it('should show install button with namespace', () => {
    renderPanel();
    expect(
      screen.getByRole('button', { name: 'Install' }),
    ).toBeInTheDocument();
  });

  it('should disable install button when no onInstall handler', () => {
    renderPanel(fullQuickstart);
    expect(
      screen.getByRole('button', { name: 'Install' }),
    ).toBeDisabled();
  });

  it('should call onInstall when install button is clicked', async () => {
    const user = userEvent.setup();
    const onInstall = jest.fn();
    renderPanel(fullQuickstart, onInstall);

    await user.click(
      screen.getByRole('button', { name: 'Install' }),
    );
    expect(onInstall).toHaveBeenCalledWith(fullQuickstart);
  });

  it('should handle minimal quickstart without optional fields', () => {
    renderPanel(minimalQuickstart);

    expect(screen.getByText('basic-app')).toBeInTheDocument();
    expect(screen.queryByText('Prerequisites')).not.toBeInTheDocument();
    expect(screen.queryByText('Required permissions')).not.toBeInTheDocument();
  });

  it('should render chart source for in-repo charts', () => {
    const repoChart: CatalogQuickstart = {
      ...fullQuickstart,
      deployment: {
        scope: 'project',
        chart: { type: 'repo', path: 'deploy/helm/' },
      },
    };
    renderPanel(repoChart);
    expect(
      screen.getByText(
        'https://github.com/example/lemonade (deploy/helm/)',
      ),
    ).toBeInTheDocument();
  });

  it('should show spinners per verb while RBAC is loading', () => {
    mockAccessReview.loading = true;
    renderPanel(fullQuickstart, jest.fn());

    expect(screen.getAllByLabelText('Checking create')).toHaveLength(2);
    expect(screen.getByLabelText('Checking delete')).toBeInTheDocument();
    expect(screen.getByText('Checking permissions…')).toBeInTheDocument();
  });

  it('should show denied icons and disable install when RBAC denies permissions', () => {
    mockAccessReview.results = [
      { verb: 'create', resource: 'deployments', group: 'apps', allowed: false },
      { verb: 'delete', resource: 'deployments', group: 'apps', allowed: true },
      { verb: 'create', resource: 'services', group: '', allowed: true },
    ];
    renderPanel(fullQuickstart, jest.fn());

    expect(screen.getByLabelText('create denied')).toBeInTheDocument();
    expect(screen.getByLabelText('delete allowed')).toBeInTheDocument();
    expect(screen.getByLabelText('create allowed')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Install' }),
    ).toBeDisabled();
  });

  it('should show allowed icons and enable install when all RBAC checks pass', () => {
    mockAccessReview.results = [
      { verb: 'create', resource: 'deployments', group: 'apps', allowed: true },
      { verb: 'delete', resource: 'deployments', group: 'apps', allowed: true },
      { verb: 'create', resource: 'services', group: '', allowed: true },
    ];
    const onInstall = jest.fn();
    renderPanel(fullQuickstart, onInstall);

    expect(screen.getAllByLabelText(/allowed/)).toHaveLength(3);
    expect(screen.queryByLabelText(/denied/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Install' }),
    ).toBeEnabled();
  });

  it('should render the project selector bound to the namespace', () => {
    renderPanel();
    expect(screen.getByTestId('project-selector')).toHaveTextContent(
      'my-namespace',
    );
  });

  it('should disable install for a protected namespace', () => {
    renderPanel(fullQuickstart, jest.fn(), { isProtectedNamespace: true });
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('should disable install when a quickstart is already deployed', () => {
    renderPanel(fullQuickstart, jest.fn(), { alreadyDeployed: true });
    expect(screen.getByRole('button', { name: 'Install' })).toBeDisabled();
  });

  it('should show checking state while the namespace status is loading', () => {
    renderPanel(fullQuickstart, jest.fn(), { namespaceStatusLoading: true });
    expect(screen.getByText('Checking project…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Checking project/ })).toBeDisabled();
  });
});

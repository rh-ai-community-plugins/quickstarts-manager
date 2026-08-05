import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPage from '../SettingsPage';
import { PluginSettings } from '~/app/types/settings';
import { KubeStatus } from '~/app/hooks/useCurrentUser';

const mockSettings: PluginSettings = {
  githubToken: '****c123',
  proxyUrl: 'http://proxy:3128',
  source: 'secret',
};

const mockUseSettings: {
  settings: PluginSettings | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  save: jest.Mock;
  remove: jest.Mock;
} = {
  settings: mockSettings,
  loading: false,
  error: null,
  saving: false,
  save: jest.fn(),
  remove: jest.fn(),
};

const mockUseCurrentUser = {
  user: { isAdmin: true } as KubeStatus,
  loading: false,
  error: null,
};

jest.mock('~/app/hooks/useSettings', () => ({
  useSettings: () => mockUseSettings,
}));

jest.mock('~/app/hooks/useCurrentUser', () => ({
  useCurrentUser: () => mockUseCurrentUser,
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCurrentUser.user = { isAdmin: true } as KubeStatus;
    mockUseCurrentUser.loading = false;
    mockUseSettings.settings = mockSettings;
    mockUseSettings.loading = false;
    mockUseSettings.error = null;
    mockUseSettings.saving = false;
  });

  it('renders form fields for admin users', () => {
    render(<SettingsPage />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByLabelText('GitHub personal access token')).toBeInTheDocument();
    expect(screen.getByLabelText('HTTP proxy URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Save settings')).toBeInTheDocument();
    expect(screen.getByLabelText('Clear settings')).toBeInTheDocument();
  });

  it('shows access denied for non-admin users', () => {
    mockUseCurrentUser.user = { isAdmin: false } as KubeStatus;

    render(<SettingsPage />);

    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(screen.getByText(/cluster-admin permissions/)).toBeInTheDocument();
  });

  it('shows spinner while loading', () => {
    mockUseSettings.loading = true;

    render(<SettingsPage />);

    expect(screen.getByLabelText('Loading settings')).toBeInTheDocument();
  });

  it('shows error alert when error occurs', () => {
    mockUseSettings.error = 'Something went wrong';

    render(<SettingsPage />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows settings source info', () => {
    render(<SettingsPage />);

    expect(screen.getByText(/Settings loaded from Kubernetes Secret/)).toBeInTheDocument();
  });

  it('populates proxy URL from settings', () => {
    render(<SettingsPage />);

    const proxyInput = screen.getByLabelText('HTTP proxy URL') as HTMLInputElement;
    expect(proxyInput.value).toBe('http://proxy:3128');
  });

  it('calls save with entered values', async () => {
    mockUseSettings.save.mockResolvedValue(undefined);

    render(<SettingsPage />);

    const tokenInput = screen.getByLabelText('GitHub personal access token');
    fireEvent.change(tokenInput, { target: { value: 'ghp_new_token' } });

    const saveButton = screen.getByLabelText('Save settings');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUseSettings.save).toHaveBeenCalledWith({
        githubToken: 'ghp_new_token',
        proxyUrl: 'http://proxy:3128',
      });
    });
  });

  it('calls remove on clear', async () => {
    mockUseSettings.remove.mockResolvedValue(undefined);

    render(<SettingsPage />);

    const clearButton = screen.getByLabelText('Clear settings');
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(mockUseSettings.remove).toHaveBeenCalled();
    });
  });

  it('disables clear button when source is default', () => {
    mockUseSettings.settings = { githubToken: null, proxyUrl: null, source: 'default' };

    render(<SettingsPage />);

    const clearButton = screen.getByLabelText('Clear settings');
    expect(clearButton).toBeDisabled();
  });
});

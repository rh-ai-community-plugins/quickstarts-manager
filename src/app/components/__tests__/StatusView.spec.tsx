import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusView } from '../StatusView';

const baseStatus = {
  release: {
    name: 'my-quickstart',
    namespace: 'test-ns',
    status: 'deployed',
    chart: 'my-quickstart-1.2.0',
    appVersion: '1.2.0',
  },
  routes: [] as Array<{ name: string; url: string }>,
};

const defaultProps = {
  status: baseStatus,
  namespace: 'test-ns',
  onUpgrade: jest.fn(),
  onRemove: jest.fn(),
  onRefresh: jest.fn(),
  isLifecycleLoading: false,
};

describe('StatusView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render release name and status badge', () => {
    render(<StatusView {...defaultProps} />);

    expect(screen.getByText('my-quickstart')).toBeInTheDocument();
    expect(screen.getByText('deployed')).toBeInTheDocument();
  });

  it('should render release details', () => {
    render(<StatusView {...defaultProps} />);

    expect(screen.getByText('test-ns')).toBeInTheDocument();
    expect(screen.getByText('my-quickstart-1.2.0')).toBeInTheDocument();
    expect(screen.getAllByText('1.2.0').length).toBeGreaterThanOrEqual(1);
  });

  it('should show routes as external links', () => {
    const statusWithRoutes = {
      ...baseStatus,
      routes: [
        { name: 'frontend', url: 'https://frontend.example.com' },
        { name: 'api', url: 'https://api.example.com' },
      ],
    };

    render(<StatusView {...defaultProps} status={statusWithRoutes} />);

    expect(screen.getByText('Application Routes')).toBeInTheDocument();
    const frontendLink = screen.getByText('frontend');
    expect(frontendLink.closest('a')).toHaveAttribute(
      'href',
      'https://frontend.example.com',
    );
    expect(frontendLink.closest('a')).toHaveAttribute('target', '_blank');

    const apiLink = screen.getByText('api');
    expect(apiLink.closest('a')).toHaveAttribute(
      'href',
      'https://api.example.com',
    );
  });

  it('should not show routes section when no routes exist', () => {
    render(<StatusView {...defaultProps} />);

    expect(screen.queryByText('Application Routes')).not.toBeInTheDocument();
  });

  it('should show upgrade button when catalog version differs', () => {
    render(<StatusView {...defaultProps} catalogVersion="2.0.0" />);

    expect(screen.getByText('Upgrade')).toBeInTheDocument();
    expect(screen.getByText(/Update available: 2.0.0/)).toBeInTheDocument();
  });

  it('should not show upgrade button when versions match', () => {
    render(<StatusView {...defaultProps} catalogVersion="1.2.0" />);

    expect(screen.queryByText('Upgrade')).not.toBeInTheDocument();
  });

  it('should not show upgrade button when no catalog version provided', () => {
    render(<StatusView {...defaultProps} />);

    expect(screen.queryByText('Upgrade')).not.toBeInTheDocument();
  });

  it('should always show remove button', () => {
    render(<StatusView {...defaultProps} />);

    expect(screen.getByText('Remove')).toBeInTheDocument();
  });

  it('should call onRemove when remove is clicked', async () => {
    const user = userEvent.setup();
    render(<StatusView {...defaultProps} />);

    await user.click(screen.getByText('Remove'));
    expect(defaultProps.onRemove).toHaveBeenCalledTimes(1);
  });

  it('should call onUpgrade when upgrade is clicked', async () => {
    const user = userEvent.setup();
    render(<StatusView {...defaultProps} catalogVersion="2.0.0" />);

    await user.click(screen.getByText('Upgrade'));
    expect(defaultProps.onUpgrade).toHaveBeenCalledTimes(1);
  });

  it('should call onRefresh when refresh is clicked', async () => {
    const user = userEvent.setup();
    render(<StatusView {...defaultProps} />);

    await user.click(screen.getByLabelText('Refresh status'));
    expect(defaultProps.onRefresh).toHaveBeenCalledTimes(1);
  });

  it('should disable action buttons when lifecycle is loading', () => {
    render(
      <StatusView
        {...defaultProps}
        catalogVersion="2.0.0"
        isLifecycleLoading={true}
      />,
    );

    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('should render failed status with red badge', () => {
    const failedStatus = {
      ...baseStatus,
      release: { ...baseStatus.release, status: 'failed' },
    };

    render(<StatusView {...defaultProps} status={failedStatus} />);

    expect(screen.getByText('failed')).toBeInTheDocument();
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LifecycleProgressModal from '../LifecycleProgressModal';

const defaultProps = {
  isOpen: true,
  operation: 'install' as const,
  steps: [
    { id: 'resolve', label: 'Resolving quickstart', status: 'completed' as const },
    { id: 'helm-install', label: 'Running helm install', status: 'running' as const },
  ],
  success: null as boolean | null,
  message: null as string | null,
  onClose: jest.fn(),
};

describe('LifecycleProgressModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null when operation is null', () => {
    const { container } = render(
      <LifecycleProgressModal {...defaultProps} operation={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('should show in-progress title during install', () => {
    render(<LifecycleProgressModal {...defaultProps} />);
    expect(screen.getByText('Installing quickstart')).toBeInTheDocument();
  });

  it('should show in-progress title during upgrade', () => {
    render(<LifecycleProgressModal {...defaultProps} operation="upgrade" />);
    expect(screen.getByText('Upgrading quickstart')).toBeInTheDocument();
  });

  it('should show in-progress title during remove', () => {
    render(<LifecycleProgressModal {...defaultProps} operation="remove" />);
    expect(screen.getByText('Removing quickstart')).toBeInTheDocument();
  });

  it('should render progress steps', () => {
    render(<LifecycleProgressModal {...defaultProps} />);
    expect(screen.getByText('Resolving quickstart')).toBeInTheDocument();
    expect(screen.getAllByText('Running helm install').length).toBeGreaterThanOrEqual(1);
  });

  it('should show success title when completed', () => {
    render(
      <LifecycleProgressModal
        {...defaultProps}
        success={true}
        message="Installation complete"
      />,
    );
    expect(screen.getByText('Quickstart installed')).toBeInTheDocument();
  });

  it('should show success alert with message', () => {
    render(
      <LifecycleProgressModal
        {...defaultProps}
        success={true}
        message="Installation complete"
      />,
    );
    expect(screen.getByText('Installation complete')).toBeInTheDocument();
  });

  it('should show failure title when failed', () => {
    render(
      <LifecycleProgressModal
        {...defaultProps}
        success={false}
        message="RBAC check denied"
      />,
    );
    expect(
      screen.getByText('Installing quickstart failed'),
    ).toBeInTheDocument();
  });

  it('should show error alert with message on failure', () => {
    render(
      <LifecycleProgressModal
        {...defaultProps}
        success={false}
        message="RBAC check denied"
      />,
    );
    expect(screen.getByText('Operation failed')).toBeInTheDocument();
    expect(screen.getByText('RBAC check denied')).toBeInTheDocument();
  });

  it('should show "Done" button on success', () => {
    render(
      <LifecycleProgressModal {...defaultProps} success={true} message="OK" />,
    );
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('should show "Close" button on failure', () => {
    render(
      <LifecycleProgressModal
        {...defaultProps}
        success={false}
        message="Error"
      />,
    );
    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('should disable button while in progress', () => {
    render(<LifecycleProgressModal {...defaultProps} />);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
  });

  it('should call onClose when Done is clicked after success', async () => {
    const user = userEvent.setup();
    render(
      <LifecycleProgressModal {...defaultProps} success={true} message="OK" />,
    );

    await user.click(screen.getByText('Done'));
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });

  it('should show step error in description', () => {
    const stepsWithError = [
      {
        id: 'helm-install',
        label: 'Running helm install',
        status: 'failed' as const,
        error: 'Timed out after 330s',
      },
    ];

    render(
      <LifecycleProgressModal
        {...defaultProps}
        steps={stepsWithError}
        success={false}
        message="Install failed"
      />,
    );
    expect(screen.getByText('Timed out after 330s')).toBeInTheDocument();
  });
});

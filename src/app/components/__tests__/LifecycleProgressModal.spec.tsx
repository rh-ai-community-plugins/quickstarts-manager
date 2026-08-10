import React from 'react';
import { render, screen, act } from '@testing-library/react';
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
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
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

  it('should show a spinner on the running step', () => {
    render(<LifecycleProgressModal {...defaultProps} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('should show elapsed time on the running step', () => {
    render(<LifecycleProgressModal {...defaultProps} />);
    expect(screen.getByText('0s')).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(5000));
    expect(screen.getByText('5s')).toBeInTheDocument();
  });

  it('should format elapsed time with minutes', () => {
    render(<LifecycleProgressModal {...defaultProps} />);

    act(() => jest.advanceTimersByTime(75_000));
    expect(screen.getByText('1m 15s')).toBeInTheDocument();
  });

  it('should reset elapsed time when running step changes', () => {
    const { rerender } = render(<LifecycleProgressModal {...defaultProps} />);

    act(() => jest.advanceTimersByTime(10_000));
    expect(screen.getByText('10s')).toBeInTheDocument();

    const newSteps = [
      { id: 'resolve', label: 'Resolving quickstart', status: 'completed' as const },
      { id: 'helm-install', label: 'Running helm install', status: 'completed' as const },
      { id: 'discover-routes', label: 'Discovering routes', status: 'running' as const },
    ];
    rerender(<LifecycleProgressModal {...defaultProps} steps={newSteps} />);

    expect(screen.getByText('0s')).toBeInTheDocument();
  });

  it('should not show spinner or elapsed time on completed steps', () => {
    const completedSteps = [
      { id: 'resolve', label: 'Resolving quickstart', status: 'completed' as const },
      { id: 'helm-install', label: 'Running helm install', status: 'completed' as const },
    ];

    render(
      <LifecycleProgressModal
        {...defaultProps}
        steps={completedSteps}
        success={true}
        message="Done"
      />,
    );
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('0s')).not.toBeInTheDocument();
  });

  it('should show cleanup hint after successful removal', () => {
    render(
      <LifecycleProgressModal
        {...defaultProps}
        operation="remove"
        success={true}
        message="Release removed"
      />,
    );
    expect(screen.getByText('Manual cleanup may be needed')).toBeInTheDocument();
    expect(screen.getByText(/Persistent Volume Claims/)).toBeInTheDocument();
    expect(screen.getByText(/namespace itself/)).toBeInTheDocument();
  });

  it('should not show cleanup hint after successful install', () => {
    render(
      <LifecycleProgressModal
        {...defaultProps}
        operation="install"
        success={true}
        message="Installed"
      />,
    );
    expect(screen.queryByText('Manual cleanup may be needed')).not.toBeInTheDocument();
  });

  it('should not show cleanup hint after failed removal', () => {
    render(
      <LifecycleProgressModal
        {...defaultProps}
        operation="remove"
        success={false}
        message="Failed"
      />,
    );
    expect(screen.queryByText('Manual cleanup may be needed')).not.toBeInTheDocument();
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RemoveQuickstartModal from '../RemoveQuickstartModal';

const defaultProps = {
  quickstartName: 'my-app',
  isOpen: true,
  isLoading: false,
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
};

describe('RemoveQuickstartModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the modal with warning', () => {
    render(<RemoveQuickstartModal {...defaultProps} />);
    expect(screen.getByText('Remove quickstart')).toBeInTheDocument();
    expect(
      screen.getByText('This action cannot be undone'),
    ).toBeInTheDocument();
  });

  it('should show confirmation prompt with quickstart name', () => {
    render(<RemoveQuickstartModal {...defaultProps} />);
    expect(
      screen.getByText('Type "my-app" to confirm removal'),
    ).toBeInTheDocument();
  });

  it('should disable remove button until name matches', () => {
    render(<RemoveQuickstartModal {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  it('should enable remove button when name matches', async () => {
    const user = userEvent.setup();
    render(<RemoveQuickstartModal {...defaultProps} />);

    await user.type(screen.getByLabelText('Confirm quickstart name'), 'my-app');
    expect(screen.getByRole('button', { name: 'Remove' })).not.toBeDisabled();
  });

  it('should show error helper when text does not match', async () => {
    const user = userEvent.setup();
    render(<RemoveQuickstartModal {...defaultProps} />);

    await user.type(screen.getByLabelText('Confirm quickstart name'), 'wrong');
    expect(screen.getByText('Name does not match')).toBeInTheDocument();
  });

  it('should not show error helper when input is empty', () => {
    render(<RemoveQuickstartModal {...defaultProps} />);
    expect(screen.queryByText('Name does not match')).not.toBeInTheDocument();
  });

  it('should call onConfirm when name matches and remove is clicked', async () => {
    const user = userEvent.setup();
    render(<RemoveQuickstartModal {...defaultProps} />);

    await user.type(screen.getByLabelText('Confirm quickstart name'), 'my-app');
    await user.click(screen.getByText('Remove'));

    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('should call onCancel when cancel is clicked', async () => {
    const user = userEvent.setup();
    render(<RemoveQuickstartModal {...defaultProps} />);

    await user.click(screen.getByText('Cancel'));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it('should disable input and cancel when loading', () => {
    render(<RemoveQuickstartModal {...defaultProps} isLoading={true} />);

    expect(screen.getByLabelText('Confirm quickstart name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('should clear input when quickstart name changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <RemoveQuickstartModal {...defaultProps} />,
    );

    await user.type(
      screen.getByLabelText('Confirm quickstart name'),
      'my-app',
    );
    expect(screen.getByLabelText('Confirm quickstart name')).toHaveValue(
      'my-app',
    );

    rerender(
      <RemoveQuickstartModal {...defaultProps} quickstartName="other-app" />,
    );

    expect(screen.getByLabelText('Confirm quickstart name')).toHaveValue('');
  });
});

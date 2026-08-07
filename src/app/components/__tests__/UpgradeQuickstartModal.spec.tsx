import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpgradeQuickstartModal from '../UpgradeQuickstartModal';
import type { QuickstartConfigurableValue } from '~/app/types/catalog';

const fields: QuickstartConfigurableValue[] = [
  {
    key: 'replicaCount',
    label: 'Replica count',
    type: 'number',
    default: 1,
    required: true,
  },
];

describe('UpgradeQuickstartModal', () => {
  it('should render a simple confirm dialog when there are no configurableValues', () => {
    const getValues = jest.fn();
    render(
      <UpgradeQuickstartModal
        quickstartName="my-app"
        namespace="test-ns"
        isOpen
        isLoading={false}
        getValues={getValues}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByText(/Are you sure/)).toBeInTheDocument();
    expect(getValues).not.toHaveBeenCalled();
  });

  it('should call onConfirm with no arguments for the simple confirm dialog', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    render(
      <UpgradeQuickstartModal
        quickstartName="my-app"
        namespace="test-ns"
        isOpen
        isLoading={false}
        getValues={jest.fn()}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(onConfirm).toHaveBeenCalledWith();
  });

  it('should fetch and seed installed values when configurableValues are present', async () => {
    const getValues = jest.fn().mockResolvedValue({ replicaCount: 5 });
    render(
      <UpgradeQuickstartModal
        quickstartName="my-app"
        configurableValues={fields}
        namespace="test-ns"
        isOpen
        isLoading={false}
        getValues={getValues}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(getValues).toHaveBeenCalledWith('my-app', 'test-ns');

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Replica count') as HTMLInputElement).value,
      ).toBe('5');
    });
  });

  it('should fall back to defaults and show a warning when fetching installed values fails', async () => {
    const getValues = jest.fn().mockRejectedValue(new Error('boom'));
    render(
      <UpgradeQuickstartModal
        quickstartName="my-app"
        configurableValues={fields}
        namespace="test-ns"
        isOpen
        isLoading={false}
        getValues={getValues}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/boom/)).toBeInTheDocument();
    });
    expect(
      (screen.getByLabelText('Replica count') as HTMLInputElement).value,
    ).toBe('1');
  });

  it('should call onConfirm with the built payload once values are loaded', async () => {
    const user = userEvent.setup();
    const getValues = jest.fn().mockResolvedValue({ replicaCount: 5 });
    const onConfirm = jest.fn();
    render(
      <UpgradeQuickstartModal
        quickstartName="my-app"
        configurableValues={fields}
        namespace="test-ns"
        isOpen
        isLoading={false}
        getValues={getValues}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Replica count') as HTMLInputElement).value,
      ).toBe('5');
    });

    await user.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(onConfirm).toHaveBeenCalledWith({ replicaCount: 5 });
  });

  it('should block confirm and surface an error for invalid values', async () => {
    const user = userEvent.setup();
    const getValues = jest.fn().mockResolvedValue({ replicaCount: 5 });
    const onConfirm = jest.fn();
    render(
      <UpgradeQuickstartModal
        quickstartName="my-app"
        configurableValues={fields}
        namespace="test-ns"
        isOpen
        isLoading={false}
        getValues={getValues}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Replica count') as HTMLInputElement).value,
      ).toBe('5');
    });

    await user.clear(screen.getByLabelText('Replica count'));
    await user.click(screen.getByRole('button', { name: 'Upgrade' }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(
      screen.getByText('Replica count is required'),
    ).toBeInTheDocument();
  });

  it('should not fetch values when closed', () => {
    const getValues = jest.fn();
    render(
      <UpgradeQuickstartModal
        quickstartName="my-app"
        configurableValues={fields}
        namespace="test-ns"
        isOpen={false}
        isLoading={false}
        getValues={getValues}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />,
    );

    expect(getValues).not.toHaveBeenCalled();
  });

  it('should call onCancel when cancel is clicked', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    render(
      <UpgradeQuickstartModal
        quickstartName="my-app"
        namespace="test-ns"
        isOpen
        isLoading={false}
        getValues={jest.fn()}
        onConfirm={jest.fn()}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

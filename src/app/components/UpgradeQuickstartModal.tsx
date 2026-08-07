import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from '@patternfly/react-core';
import type { QuickstartConfigurableValue } from '~/app/types/catalog';
import { QuickstartValuesForm } from './QuickstartValuesForm';
import {
  buildPayload,
  seedFromInstalled,
  validateFields,
  type ValuesFormErrors,
  type ValuesFormState,
} from '~/app/utils/values';

export interface UpgradeQuickstartModalProps {
  quickstartName: string | null;
  configurableValues?: QuickstartConfigurableValue[];
  namespace: string | null;
  isOpen: boolean;
  isLoading: boolean;
  getValues: (name: string, namespace: string) => Promise<Record<string, unknown>>;
  onConfirm: (values?: Record<string, unknown>) => void;
  onCancel: () => void;
}

const UpgradeQuickstartModal: React.FC<UpgradeQuickstartModalProps> = ({
  quickstartName,
  configurableValues,
  namespace,
  isOpen,
  isLoading,
  getValues,
  onConfirm,
  onCancel,
}) => {
  const hasFields = !!configurableValues?.length;

  const [valuesState, setValuesState] = useState<ValuesFormState>({});
  const [valuesErrors, setValuesErrors] = useState<ValuesFormErrors>({});
  const [loadingValues, setLoadingValues] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !hasFields || !quickstartName || !namespace) return;

    let cancelled = false;
    setLoadingValues(true);
    setFetchError(null);
    setValuesErrors({});

    getValues(quickstartName, namespace)
      .then((installed) => {
        if (cancelled) return;
        setValuesState(seedFromInstalled(configurableValues, installed));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFetchError(
          err instanceof Error ? err.message : 'Failed to load current values',
        );
        setValuesState(seedFromInstalled(configurableValues, undefined));
      })
      .finally(() => {
        if (!cancelled) setLoadingValues(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, hasFields, quickstartName, namespace, getValues, configurableValues]);

  const handleValueChange = (key: string, value: string | boolean) => {
    setValuesState((prev) => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    if (!hasFields) {
      onConfirm();
      return;
    }
    const errors = validateFields(configurableValues, valuesState);
    setValuesErrors(errors);
    if (Object.values(errors).some((error) => error)) {
      return;
    }
    onConfirm(buildPayload(configurableValues, valuesState));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      variant={hasFields ? 'medium' : 'small'}
      aria-label="Confirm quickstart upgrade"
    >
      <ModalHeader title="Upgrade quickstart" />
      <ModalBody>
        {!hasFields && (
          <p>
            Are you sure you want to upgrade{' '}
            <strong>{quickstartName}</strong> to the latest available
            version?
          </p>
        )}
        {hasFields && loadingValues && (
          <Spinner size="lg" aria-label="Loading current values" />
        )}
        {hasFields && !loadingValues && (
          <>
            {fetchError && (
              <Alert
                variant="warning"
                title="Could not load current values"
                isInline
                className="pf-v6-u-mb-md"
              >
                {fetchError} Showing default values instead.
              </Alert>
            )}
            <QuickstartValuesForm
              fields={configurableValues ?? []}
              values={valuesState}
              errors={valuesErrors}
              onChange={handleValueChange}
              isDisabled={isLoading}
            />
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={handleConfirm}
          isDisabled={hasFields && loadingValues}
          isLoading={isLoading}
        >
          Upgrade
        </Button>
        <Button variant="link" onClick={onCancel} isDisabled={isLoading}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default UpgradeQuickstartModal;

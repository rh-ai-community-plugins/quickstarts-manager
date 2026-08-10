import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Button,
  Alert,
  ProgressStep,
  ProgressStepper,
  Spinner,
} from '@patternfly/react-core';
import type { LifecycleStep, LifecycleOperation } from '~/app/types/lifecycle';

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

function useElapsedTime(runningStepId: string | undefined): number {
  const [elapsed, setElapsed] = useState(0);
  const prevStepId = useRef(runningStepId);

  useEffect(() => {
    if (runningStepId !== prevStepId.current) {
      setElapsed(0);
      prevStepId.current = runningStepId;
    }

    if (!runningStepId) return;

    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [runningStepId]);

  return elapsed;
}

interface LifecycleProgressModalProps {
  isOpen: boolean;
  operation: LifecycleOperation | null;
  steps: LifecycleStep[];
  success: boolean | null;
  message: string | null;
  onClose: () => void;
}

const operationTitle: Record<LifecycleOperation, string> = {
  install: 'Installing quickstart',
  upgrade: 'Upgrading quickstart',
  remove: 'Removing quickstart',
};

const operationSuccessTitle: Record<LifecycleOperation, string> = {
  install: 'Quickstart installed',
  upgrade: 'Quickstart upgraded',
  remove: 'Quickstart removed',
};

function stepVariant(
  status: LifecycleStep['status'],
): 'success' | 'info' | 'pending' | 'danger' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'running':
      return 'info';
    case 'failed':
      return 'danger';
    default:
      return 'pending';
  }
}

const LifecycleProgressModal: React.FC<LifecycleProgressModalProps> = ({
  isOpen,
  operation,
  steps,
  success,
  message,
  onClose,
}) => {
  if (!operation) return null;

  const inProgress = success === null;
  const title = inProgress
    ? operationTitle[operation]
    : success
      ? operationSuccessTitle[operation]
      : `${operationTitle[operation]} failed`;

  const runningStepId = steps.find((s) => s.status === 'running')?.id;
  const elapsed = useElapsedTime(runningStepId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={inProgress ? undefined : onClose}
      variant="medium"
      aria-label={title}
    >
      <ModalHeader title={title} />
      <ModalBody>
        <div aria-live="polite" aria-atomic="false" className="pf-v6-screen-reader">
          {steps.filter((s) => s.status === 'running').map((s) => s.label).join(', ')}
        </div>
        {steps.length > 0 && (
          <ProgressStepper isVertical>
            {steps.map((step) => {
              const isRunning = step.status === 'running';
              const description = step.error ?? (isRunning ? formatElapsed(elapsed) : undefined);
              return (
                <ProgressStep
                  key={step.id}
                  variant={stepVariant(step.status)}
                  isCurrent={isRunning}
                  id={step.id}
                  titleId={`${step.id}-title`}
                  aria-label={step.label}
                  description={description}
                  icon={isRunning ? <Spinner size="md" /> : undefined}
                >
                  {step.label}
                </ProgressStep>
              );
            })}
          </ProgressStepper>
        )}
        {success === false && message && (
          <Alert
            variant="danger"
            title="Operation failed"
            isInline
            className="pf-v6-u-mt-md"
          >
            {message}
          </Alert>
        )}
        {success === true && message && (
          <Alert
            variant="success"
            title={message}
            isInline
            className="pf-v6-u-mt-md"
          />
        )}
        {success === true && operation === 'remove' && (
          <Alert
            variant="info"
            title="Manual cleanup may be needed"
            isInline
            className="pf-v6-u-mt-md"
          >
            The Helm release has been removed, but some resources may remain:
            <ul>
              <li>Persistent Volume Claims (PVCs) created by the quickstart</li>
              <li>The namespace itself, if no longer needed</li>
            </ul>
            Check the namespace and delete any leftover resources manually.
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        <Button
          variant="primary"
          onClick={inProgress ? undefined : onClose}
          isAriaDisabled={inProgress}
        >
          {success ? 'Done' : 'Close'}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default LifecycleProgressModal;

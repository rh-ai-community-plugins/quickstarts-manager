import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Button,
  TextInput,
  Alert,
  FormGroup,
  Form,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';

interface RemoveQuickstartModalProps {
  quickstartName: string | null;
  isOpen: boolean;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const RemoveQuickstartModal: React.FC<RemoveQuickstartModalProps> = ({
  quickstartName,
  isOpen,
  isLoading,
  onConfirm,
  onCancel,
}) => {
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    setConfirmText('');
  }, [quickstartName]);

  const isMatch = confirmText === quickstartName;

  const handleConfirm = () => {
    if (!isMatch) return;
    onConfirm();
  };

  const handleClose = () => {
    setConfirmText('');
    onCancel();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      variant="small"
      aria-label="Confirm quickstart removal"
    >
      <ModalHeader title="Remove quickstart" />
      <ModalBody>
        <Alert
          variant="warning"
          title="This action cannot be undone"
          isInline
          className="pf-v6-u-mb-md"
        >
          Removing this quickstart will uninstall its Helm release and all
          associated resources from the namespace.
        </Alert>
        <Form>
          <FormGroup
            label={`Type "${quickstartName}" to confirm removal`}
            isRequired
            fieldId="confirm-remove-input"
          >
            <TextInput
              id="confirm-remove-input"
              value={confirmText}
              onChange={(_event, value) => setConfirmText(value)}
              aria-label="Confirm quickstart name"
              isDisabled={isLoading}
            />
            {confirmText.length > 0 && !isMatch && (
              <HelperText>
                <HelperTextItem variant="error">
                  Name does not match
                </HelperTextItem>
              </HelperText>
            )}
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button
          variant="danger"
          onClick={handleConfirm}
          isDisabled={!isMatch}
          isLoading={isLoading}
        >
          Remove
        </Button>
        <Button variant="link" onClick={handleClose} isDisabled={isLoading}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default RemoveQuickstartModal;

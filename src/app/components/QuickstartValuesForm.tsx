import React from 'react';
import {
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Switch,
  TextInput,
} from '@patternfly/react-core';
import type { QuickstartConfigurableValue } from '~/app/types/catalog';
import type { ValuesFormErrors, ValuesFormState } from '~/app/utils/values';

export interface QuickstartValuesFormProps {
  fields: QuickstartConfigurableValue[];
  values: ValuesFormState;
  errors: ValuesFormErrors;
  onChange: (key: string, value: string | boolean) => void;
  isDisabled?: boolean;
}

export const QuickstartValuesForm: React.FC<QuickstartValuesFormProps> = ({
  fields,
  values,
  errors,
  onChange,
  isDisabled = false,
}) => {
  return (
    <Form>
      {fields.map((field) => {
        const label = field.label ?? field.key;
        const fieldId = `quickstart-value-${field.key}`;
        const error = errors[field.key];

        if (field.type === 'boolean') {
          return (
            <FormGroup key={field.key} label={label} fieldId={fieldId}>
              <Switch
                id={fieldId}
                label={label}
                isChecked={Boolean(values[field.key])}
                onChange={(_event, checked) => onChange(field.key, checked)}
                isDisabled={isDisabled}
              />
              {field.description && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem>{field.description}</HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          );
        }

        const rawValue = typeof values[field.key] === 'string' ? (values[field.key] as string) : '';

        if (field.type === 'string' && field.options?.length) {
          return (
            <FormGroup key={field.key} label={label} fieldId={fieldId} isRequired={field.required}>
              <FormSelect
                id={fieldId}
                value={rawValue}
                onChange={(_event, value) => onChange(field.key, value)}
                isDisabled={isDisabled}
                validated={error ? 'error' : 'default'}
                aria-label={label}
              >
                <FormSelectOption value="" label="Select a value" isPlaceholder />
                {field.options.map((option) => (
                  <FormSelectOption key={option} value={option} label={option} />
                ))}
              </FormSelect>
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant={error ? 'error' : 'default'}>
                    {error ?? field.description}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          );
        }

        return (
          <FormGroup key={field.key} label={label} fieldId={fieldId} isRequired={field.required}>
            <TextInput
              id={fieldId}
              type={field.type === 'number' ? 'number' : 'text'}
              value={rawValue}
              onChange={(_event, value) => onChange(field.key, value)}
              isDisabled={isDisabled}
              validated={error ? 'error' : 'default'}
              aria-label={label}
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem variant={error ? 'error' : 'default'}>
                  {error ?? field.description}
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>
        );
      })}
    </Form>
  );
};

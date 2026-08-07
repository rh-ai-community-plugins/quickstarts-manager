import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickstartValuesForm } from '../QuickstartValuesForm';
import type { QuickstartConfigurableValue } from '~/app/types/catalog';

const fields: QuickstartConfigurableValue[] = [
  {
    key: 'replicaCount',
    label: 'Replica count',
    description: 'Backend replicas to run.',
    type: 'number',
  },
  {
    key: 'model.name',
    label: 'Model',
    type: 'string',
    options: ['llama-3', 'mistral-7b'],
  },
  {
    key: 'plainString',
    type: 'string',
  },
  {
    key: 'enableGpu',
    label: 'Enable GPU',
    type: 'boolean',
  },
];

describe('QuickstartValuesForm', () => {
  it('should render a number field as a text input with description helper text', () => {
    render(
      <QuickstartValuesForm
        fields={fields}
        values={{ replicaCount: '2' }}
        errors={{}}
        onChange={jest.fn()}
      />,
    );

    const input = screen.getByLabelText('Replica count') as HTMLInputElement;
    expect(input).toHaveAttribute('type', 'number');
    expect(input.value).toBe('2');
    expect(screen.getByText('Backend replicas to run.')).toBeInTheDocument();
  });

  it('should render a string field with options as a dropdown', () => {
    render(
      <QuickstartValuesForm
        fields={fields}
        values={{ 'model.name': 'llama-3' }}
        errors={{}}
        onChange={jest.fn()}
      />,
    );

    const select = screen.getByLabelText('Model') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('llama-3');
    expect(screen.getByRole('option', { name: 'mistral-7b' })).toBeInTheDocument();
  });

  it('should fall back to the key as the label when no label is given', () => {
    render(
      <QuickstartValuesForm
        fields={fields}
        values={{ plainString: '' }}
        errors={{}}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('plainString')).toBeInTheDocument();
  });

  it('should render a boolean field as a switch', () => {
    render(
      <QuickstartValuesForm
        fields={fields}
        values={{ enableGpu: true }}
        errors={{}}
        onChange={jest.fn()}
      />,
    );

    const toggle = screen.getByRole('switch', { name: 'Enable GPU' });
    expect(toggle).toBeChecked();
  });

  it('should call onChange when a text field changes', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <QuickstartValuesForm
        fields={fields}
        values={{ replicaCount: '' }}
        errors={{}}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByLabelText('Replica count'), '3');
    expect(onChange).toHaveBeenCalledWith('replicaCount', '3');
  });

  it('should call onChange when the switch is toggled', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <QuickstartValuesForm
        fields={fields}
        values={{ enableGpu: false }}
        errors={{}}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('switch', { name: 'Enable GPU' }));
    expect(onChange).toHaveBeenCalledWith('enableGpu', true);
  });

  it('should show a validation error instead of the description', () => {
    render(
      <QuickstartValuesForm
        fields={fields}
        values={{ replicaCount: 'abc' }}
        errors={{ replicaCount: 'Replica count must be a number' }}
        onChange={jest.fn()}
      />,
    );

    expect(
      screen.getByText('Replica count must be a number'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Backend replicas to run.'),
    ).not.toBeInTheDocument();
  });

  it('should disable inputs when isDisabled is set', () => {
    render(
      <QuickstartValuesForm
        fields={fields}
        values={{ replicaCount: '1', enableGpu: false }}
        errors={{}}
        onChange={jest.fn()}
        isDisabled
      />,
    );

    expect(screen.getByLabelText('Replica count')).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Enable GPU' })).toBeDisabled();
  });
});

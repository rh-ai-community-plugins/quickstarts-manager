import {
  buildPayload,
  getByPath,
  initialFormState,
  seedFromInstalled,
  validateField,
  validateFields,
} from '../values';
import type { QuickstartConfigurableValue } from '~/app/types/catalog';

const numberField: QuickstartConfigurableValue = {
  key: 'replicaCount',
  label: 'Replica count',
  type: 'number',
  default: 1,
};

const requiredNumberField: QuickstartConfigurableValue = {
  key: 'replicaCount',
  label: 'Replica count',
  type: 'number',
  required: true,
};

const stringField: QuickstartConfigurableValue = {
  key: 'model.name',
  label: 'Model',
  type: 'string',
  default: 'llama-3',
};

const stringFieldWithOptions: QuickstartConfigurableValue = {
  ...stringField,
  options: ['llama-3', 'mistral-7b'],
};

const booleanField: QuickstartConfigurableValue = {
  key: 'enableGpu',
  label: 'Enable GPU',
  type: 'boolean',
  default: true,
};

describe('initialFormState', () => {
  it('should return an empty object for undefined fields', () => {
    expect(initialFormState(undefined)).toEqual({});
  });

  it('should seed string/number fields as strings from default', () => {
    expect(initialFormState([numberField, stringField])).toEqual({
      replicaCount: '1',
      'model.name': 'llama-3',
    });
  });

  it('should seed string/number fields with no default as empty string', () => {
    expect(initialFormState([requiredNumberField])).toEqual({
      replicaCount: '',
    });
  });

  it('should seed boolean fields as real booleans', () => {
    expect(initialFormState([booleanField])).toEqual({ enableGpu: true });
  });

  it('should default a boolean field without a default to false', () => {
    const field: QuickstartConfigurableValue = { key: 'flag', type: 'boolean' };
    expect(initialFormState([field])).toEqual({ flag: false });
  });
});

describe('getByPath', () => {
  it('should resolve a top-level key', () => {
    expect(getByPath({ replicaCount: 3 }, 'replicaCount')).toBe(3);
  });

  it('should resolve a nested dot-path', () => {
    expect(getByPath({ model: { name: 'mistral-7b' } }, 'model.name')).toBe(
      'mistral-7b',
    );
  });

  it('should return undefined for a missing path', () => {
    expect(getByPath({ model: {} }, 'model.name')).toBeUndefined();
    expect(getByPath({}, 'model.name')).toBeUndefined();
  });

  it('should return undefined when traversing through a non-object', () => {
    expect(getByPath({ model: 'llama-3' }, 'model.name')).toBeUndefined();
  });

  it('should return undefined for a null/undefined root', () => {
    expect(getByPath(undefined, 'model.name')).toBeUndefined();
    expect(getByPath(null, 'model.name')).toBeUndefined();
  });
});

describe('seedFromInstalled', () => {
  it('should overlay installed values on top of defaults', () => {
    const state = seedFromInstalled(
      [numberField, stringField],
      { replicaCount: 3, model: { name: 'mistral-7b' } },
    );
    expect(state).toEqual({ replicaCount: '3', 'model.name': 'mistral-7b' });
  });

  it('should fall back to declared defaults when a key is not installed', () => {
    const state = seedFromInstalled([numberField, stringField], {});
    expect(state).toEqual({ replicaCount: '1', 'model.name': 'llama-3' });
  });

  it('should handle undefined installed values', () => {
    const state = seedFromInstalled([numberField], undefined);
    expect(state).toEqual({ replicaCount: '1' });
  });

  it('should coerce installed boolean-typed values', () => {
    const state = seedFromInstalled([booleanField], { enableGpu: false });
    expect(state).toEqual({ enableGpu: false });
  });
});

describe('validateField', () => {
  it('should always return null for boolean fields', () => {
    expect(validateField(booleanField, true)).toBeNull();
    expect(validateField(booleanField, false)).toBeNull();
  });

  it('should return null for an empty optional field', () => {
    expect(validateField(numberField, '')).toBeNull();
  });

  it('should return an error for an empty required field', () => {
    expect(validateField(requiredNumberField, '')).toBe(
      'Replica count is required',
    );
  });

  it('should return an error for a non-numeric value on a number field', () => {
    expect(validateField(numberField, 'abc')).toBe(
      'Replica count must be a number',
    );
  });

  it('should return null for a valid number', () => {
    expect(validateField(numberField, '42')).toBeNull();
  });

  it('should return an error for a string value with disallowed characters', () => {
    expect(validateField(stringField, 'llama-3; rm -rf')).toBe(
      'Model contains disallowed characters',
    );
  });

  it('should return null for a valid string value', () => {
    expect(validateField(stringField, 'llama-3')).toBeNull();
  });

  it('should fall back to the field key when no label is set', () => {
    const field: QuickstartConfigurableValue = {
      key: 'someKey',
      type: 'number',
      required: true,
    };
    expect(validateField(field, '')).toBe('someKey is required');
  });

  it('should return an error for a field with a malformed key', () => {
    const field: QuickstartConfigurableValue = {
      key: 'bad key!',
      label: 'Bad Field',
      type: 'string',
    };
    expect(validateField(field, 'anything')).toBe(
      'Bad Field has an invalid key',
    );
  });
});

describe('validateFields', () => {
  it('should return an error map keyed by field key', () => {
    const errors = validateFields(
      [requiredNumberField, stringField],
      { replicaCount: '', 'model.name': 'llama-3' },
    );
    expect(errors).toEqual({
      replicaCount: 'Replica count is required',
      'model.name': null,
    });
  });

  it('should return an empty object for undefined fields', () => {
    expect(validateFields(undefined, {})).toEqual({});
  });
});

describe('buildPayload', () => {
  it('should coerce values per declared type', () => {
    const payload = buildPayload(
      [numberField, stringField, booleanField],
      { replicaCount: '3', 'model.name': 'mistral-7b', enableGpu: false },
    );
    expect(payload).toEqual({
      replicaCount: 3,
      'model.name': 'mistral-7b',
      enableGpu: false,
    });
  });

  it('should omit an empty optional string field so the chart default applies', () => {
    const payload = buildPayload([stringField], { 'model.name': '' });
    expect(payload).toEqual({});
  });

  it('should omit an empty optional number field instead of coercing to 0', () => {
    const payload = buildPayload([numberField], { replicaCount: '' });
    expect(payload).toEqual({});
  });

  it('should omit a missing string value entirely', () => {
    const payload = buildPayload([stringField], {});
    expect(payload).toEqual({});
  });

  it('should still send a populated field value equal to the spec default', () => {
    const payload = buildPayload(
      [numberField, stringField],
      initialFormState([numberField, stringField]),
    );
    expect(payload).toEqual({ replicaCount: 1, 'model.name': 'llama-3' });
  });

  it('should coerce a missing boolean value to false', () => {
    const payload = buildPayload([booleanField], {});
    expect(payload).toEqual({ enableGpu: false });
  });

  it('should support fields with an options enum', () => {
    const payload = buildPayload([stringFieldWithOptions], {
      'model.name': 'mistral-7b',
    });
    expect(payload).toEqual({ 'model.name': 'mistral-7b' });
  });

  it('should return an empty object for undefined fields', () => {
    expect(buildPayload(undefined, {})).toEqual({});
  });
});

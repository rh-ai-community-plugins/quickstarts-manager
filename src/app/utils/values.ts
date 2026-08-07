import type { QuickstartConfigurableValue } from '~/app/types/catalog';

// Mirrors the BFF's flat-scalar Helm value constraints so the form can
// reject invalid input before a request is even sent.
// Source of truth: bff/src/services/helmService.ts (VALUE_KEY_PATTERN,
// VALUE_STRING_PATTERN). Keep these in sync. The BFF also enforces a max
// key count (MAX_HELM_VALUES); no client-side check is needed since
// configurableValues is author-curated, not user-extensible.
export const VALUE_KEY_PATTERN = /^[a-zA-Z0-9._-]+$/;
export const VALUE_STRING_PATTERN = /^[a-zA-Z0-9._:/@=+\- ]*$/;

/**
 * Form state for a set of configurable values. Numbers are held as strings
 * so they can be bound directly to a controlled text input; booleans are
 * held as real booleans for the Switch component.
 */
export type ValuesFormState = Record<string, string | boolean>;

/** Validation error per field key, or null when the field is valid. */
export type ValuesFormErrors = Record<string, string | null>;

/** Seed a form state from each field's declared default. */
export function initialFormState(
  fields: QuickstartConfigurableValue[] | undefined,
): ValuesFormState {
  const state: ValuesFormState = {};
  for (const field of fields ?? []) {
    if (field.type === 'boolean') {
      state[field.key] = typeof field.default === 'boolean' ? field.default : false;
    } else {
      state[field.key] = field.default !== undefined ? String(field.default) : '';
    }
  }
  return state;
}

/** Resolve a dot-path (e.g. "model.name") from a nested object. */
export function getByPath(obj: unknown, dotPath: string): unknown {
  return dotPath.split('.').reduce<unknown>((acc, segment) => {
    if (acc === null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, obj);
}

/**
 * Seed a form state for the upgrade dialog: start from each field's
 * declared default, then overlay the value actually installed (from
 * `helm get values`), if present.
 */
export function seedFromInstalled(
  fields: QuickstartConfigurableValue[] | undefined,
  installed: Record<string, unknown> | undefined,
): ValuesFormState {
  const state = initialFormState(fields);
  for (const field of fields ?? []) {
    const installedValue = getByPath(installed, field.key);
    if (installedValue === undefined) continue;
    if (field.type === 'boolean') {
      state[field.key] = Boolean(installedValue);
    } else {
      state[field.key] = String(installedValue);
    }
  }
  return state;
}

/** Validate a single field's raw form value. Returns an error message, or null when valid. */
export function validateField(
  field: QuickstartConfigurableValue,
  rawValue: string | boolean | undefined,
): string | null {
  const label = field.label ?? field.key;

  if (!VALUE_KEY_PATTERN.test(field.key)) {
    return `${label} has an invalid key`;
  }

  if (field.type === 'boolean') {
    return null;
  }

  const raw = typeof rawValue === 'string' ? rawValue : '';

  if (raw === '') {
    return field.required ? `${label} is required` : null;
  }

  if (field.type === 'number') {
    if (!Number.isFinite(Number(raw))) {
      return `${label} must be a number`;
    }
    return null;
  }

  // string
  if (!VALUE_STRING_PATTERN.test(raw)) {
    return `${label} contains disallowed characters`;
  }
  return null;
}

/** Validate every field; returns an error map (only invalid fields, if any). */
export function validateFields(
  fields: QuickstartConfigurableValue[] | undefined,
  state: ValuesFormState,
): ValuesFormErrors {
  const errors: ValuesFormErrors = {};
  for (const field of fields ?? []) {
    errors[field.key] = validateField(field, state[field.key]);
  }
  return errors;
}

/**
 * Build the flat `--set key=value` payload sent to the BFF, coercing each
 * field to its declared type. Booleans always emit (false is meaningful).
 * String/number fields left empty are omitted entirely so the chart's own
 * default applies, instead of silently sending `--set key=` or coercing an
 * empty number to 0.
 */
export function buildPayload(
  fields: QuickstartConfigurableValue[] | undefined,
  state: ValuesFormState,
): Record<string, string | number | boolean> {
  const payload: Record<string, string | number | boolean> = {};
  for (const field of fields ?? []) {
    const value = state[field.key];
    if (field.type === 'boolean') {
      payload[field.key] = Boolean(value);
      continue;
    }
    const raw = typeof value === 'string' ? value : '';
    if (raw === '') continue;
    payload[field.key] = field.type === 'number' ? Number(raw) : raw;
  }
  return payload;
}

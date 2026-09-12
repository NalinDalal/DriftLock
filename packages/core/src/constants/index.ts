export const API_ENDPOINTS = {
  STRIPE: {
    BASE: 'https://api.stripe.com',
    VERSION: 'v1',
  },
} as const;

export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH',
} as const;

export const DRIFT_CONFIDENCE = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;

export const FIX_TYPES = {
  FIELD_RENAME: 'field_rename',
  TYPE_COERCION: 'type_coercion',
  NULL_CHECK: 'null_check',
  DEFAULT_VALUE: 'default_value',
  CUSTOM: 'custom',
} as const;

export const TEST_CLASSIFICATION = {
  MONITORED: 'monitored',
  TESTED_BUT_BLIND: 'tested_but_blind',
  UNTESTED: 'untested',
} as const;

export const ERROR_CODES = {
  PARSER_ERROR: 'PARSER_ERROR',
  SANDBOX_ERROR: 'SANDBOX_ERROR',
  AGENT_ERROR: 'AGENT_ERROR',
  GIT_ERROR: 'GIT_ERROR',
  PR_ERROR: 'PR_ERROR',
} as const;

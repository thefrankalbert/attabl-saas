import { describe, it, expect } from 'vitest';
import { ServiceError, serviceErrorToStatus } from '../errors';

describe('ServiceError', () => {
  it('should create an error with message and code', () => {
    const error = new ServiceError('Not found', 'NOT_FOUND');
    expect(error.message).toBe('Not found');
    expect(error.code).toBe('NOT_FOUND');
    expect(error.name).toBe('ServiceError');
    expect(error.details).toBeUndefined();
  });

  it('should create an error with details', () => {
    const details = { field: 'email', reason: 'duplicate' };
    const error = new ServiceError('Conflict', 'CONFLICT', details);
    expect(error.details).toEqual(details);
  });

  it('should be an instance of Error', () => {
    const error = new ServiceError('Test', 'INTERNAL');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ServiceError);
  });
});

describe('serviceErrorToStatus', () => {
  it('should map NOT_FOUND to 404', () => {
    expect(serviceErrorToStatus('NOT_FOUND')).toBe(404);
  });

  it('should map CONFLICT to 409', () => {
    expect(serviceErrorToStatus('CONFLICT')).toBe(409);
  });

  it('should map VALIDATION to 400', () => {
    expect(serviceErrorToStatus('VALIDATION')).toBe(400);
  });

  it('should map AUTH to 403', () => {
    expect(serviceErrorToStatus('AUTH')).toBe(403);
  });

  it('should map INTERNAL to 500', () => {
    expect(serviceErrorToStatus('INTERNAL')).toBe(500);
  });
});

import { hashPassword, verifyPassword, canAccess, ROLE_HOME, ROLES } from '../auth';

describe('auth lib', () => {
  it('hashes a password to a non-plaintext, stable digest', async () => {
    const h1 = await hashPassword('s3cret');
    const h2 = await hashPassword('s3cret');
    expect(h1).toBe(h2);
    expect(h1).not.toBe('s3cret');
  });

  it('verifyPassword accepts the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct-horse');
    expect(await verifyPassword('correct-horse', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  describe('canAccess', () => {
    it('grants admin access to every nav key', () => {
      ['dashboard', 'pos', 'inventory', 'audit', 'settings'].forEach((k) =>
        expect(canAccess(ROLES.ADMIN, k)).toBe(true),
      );
    });

    it('limits the cashier role to its allowed pages', () => {
      expect(canAccess(ROLES.CASHIER, 'pos')).toBe(true);
      expect(canAccess(ROLES.CASHIER, 'settings')).toBe(true);
      expect(canAccess(ROLES.CASHIER, 'inventory')).toBe(false);
      expect(canAccess(ROLES.CASHIER, 'audit')).toBe(false);
    });

    it('limits the kitchen role to kitchen / notifications / settings', () => {
      expect(canAccess(ROLES.KITCHEN, 'kitchen')).toBe(true);
      expect(canAccess(ROLES.KITCHEN, 'pos')).toBe(false);
    });

    it('returns false for an unknown role', () => {
      expect(canAccess('ghost', 'dashboard')).toBe(false);
    });
  });

  it('maps each role to a sensible home route', () => {
    expect(ROLE_HOME[ROLES.ADMIN]).toBe('/dashboard');
    expect(ROLE_HOME[ROLES.CASHIER]).toBe('/pos');
    expect(ROLE_HOME[ROLES.KITCHEN]).toBe('/kitchen');
  });
});

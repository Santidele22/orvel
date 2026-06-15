// ============================================
// Unit Tests - AuthService
// ============================================
// Tests for authentication functionality
// Spanish comments for clarity

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AuthService } from '../../services/auth.service';

describe('AuthService - Unit Tests', () => {
  let service: AuthService;

  // Setup before each test
  beforeEach(() => {
    // Limpiar localStorage antes de cada test
    localStorage.clear();
    service = new AuthService();
  });

  // Cleanup after each test
  afterEach(() => {
    localStorage.clear();
  });

  // ============================================
  // TEST: Login functionality
  // ============================================

  describe('login()', () => {
    it('debería autenticar correctamente con credenciales válidas', async () => {
      // Arrange
      const credentials = { email: 'demo@salon.com', password: 'demo123' };

      // Act
      const result = await service.login(credentials).toPromise();

      // Assert
      expect(result).toBeDefined();
      expect(result!.user).toBeDefined();
      expect(result!.user.email).toBe('demo@salon.com');
      expect(result!.token).toBeTruthy();
      expect(result!.token).toContain('mock_');
    });

    it('debería autenticar cualquier email con @ (modo mock)', async () => {
      // Arrange - In mock mode, any email with @ is accepted
      const credentials = { email: 'invalid@salon.com', password: 'wrong' };

      // Act
      const result = await service.login(credentials).toPromise();

      // Assert - Mock mode accepts any email with @
      expect(result).toBeDefined();
      expect(result!.user.email).toBe('invalid@salon.com');
    });

    it('debería cualquier email con @ ser aceptado (modo mock)', async () => {
      // Arrange
      const credentials = { email: 'any@email.com', password: 'any' };

      // Act
      const result = await service.login(credentials).toPromise();

      // Assert
      expect(result!.user.email).toBe('any@email.com');
    });
  });

  // ============================================
  // TEST: Register functionality
  // ============================================

  describe('register()', () => {
    it('debería crear nuevo usuario correctamente', async () => {
      // Arrange
      const userData = {
        email: 'new@user.com',
        password: 'password123',
        nombre: 'Nuevo',
        apellido: 'Usuario',
        negocioNombre: 'Mi Salon',
        tipoNegocio: 'uñas' as const
      };

      // Act
      const result = await service.register(userData).toPromise();

      // Assert
      expect(result).toBeDefined();
      expect(result!.user.email).toBe('new@user.com');
      expect(result!.user.nombre).toBe('Nuevo');
      expect(result!.user.apellido).toBe('Usuario');
      expect(result!.user.negocioNombre).toBe('Mi Salon');
      expect(result!.user.tipoNegocio).toBe('uñas');
      expect(result!.token).toBeTruthy();
    });

    it('debería generar token válido', async () => {
      // Arrange
      const userData = {
        email: 'test@user.com',
        password: 'password123',
        nombre: 'Test',
        apellido: 'User',
        negocioNombre: 'Test Salon',
        tipoNegocio: 'spa' as const
      };

      // Act
      const result = await service.register(userData).toPromise();

      // Assert - token debe contener временную метку
      expect(result!.token).toContain('mock_');
      expect(result!.token.length).toBeGreaterThan(10);
    });
  });

  // ============================================
  // TEST: Session management
  // ============================================

  describe('Session management', () => {
    it('debería establecer usuario después del login', async () => {
      // Arrange
      const credentials = { email: 'demo@salon.com', password: 'demo' };

      // Act
      await service.login(credentials).toPromise();

      // Assert
      expect(service.isLogged()).toBe(true);
      expect(service.getUser()).toBeDefined();
      expect(service.getUser()?.email).toBe('demo@salon.com');
    });

    it('debería cerrar sesión correctamente', async () => {
      // Arrange
      const credentials = { email: 'demo@salon.com', password: 'demo' };
      await service.login(credentials);

      // Act
      service.logout();

      // Assert
      expect(service.isLogged()).toBe(false);
      expect(service.getUser()).toBeNull();
      expect(service.getToken()).toBeNull();
    });

    it('debería cargar sesión guardada en localStorage al iniciar', async () => {
      // Arrange - Simular sesión guardada
      const mockAuthUser = {
        user: {
          id: 'user-test',
          email: 'stored@salon.com',
          nombre: 'Stored',
          apellido: 'User',
          negocioNombre: 'Stored Salon',
          tipoNegocio: 'uñas' as const,
          plan: 'free' as const,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        token: 'mock_stored_token'
      };
      localStorage.setItem('salon_auth', JSON.stringify(mockAuthUser));

      // Act - Nueva instancia del servicio
      const newService = new AuthService();

      // Assert
      expect(newService.isLogged()).toBe(true);
      expect(newService.getUser()?.email).toBe('stored@salon.com');
    });

    it('debería manejar sesión corrupta en localStorage', async () => {
      // Arrange - Sesión corrupta
      localStorage.setItem('salon_auth', 'invalid-json');

      // Act
      const newService = new AuthService();

      // Assert - Debería cerrar sesión
      expect(newService.isLogged()).toBe(false);
    });
  });

  // ============================================
  // TEST: Business templates
  // ============================================

  describe('getNegocioTemplate()', () => {
    it('debería retornar template de uñas para negocio de uñas', async () => {
      // Arrange
      const credentials = { email: 'demo@salon.com', password: 'demo' };
      await service.login(credentials).toPromise();

      // Act
      const template = service.getNegocioTemplate();

      // Assert
      expect(template).toBeDefined();
      expect(template.serviciosDefault).toContain('Manicura');
      expect(template.categorias).toContain('Uñas');
    });

    it('debería retornar template por defecto si no hay usuario', () => {
      // Act
      const template = service.getNegocioTemplate();

      // Assert
      expect(template).toBeDefined();
      expect(template.categorias).toContain('General');
    });
  });

  // ============================================
  // TEST: Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('debería manejar múltiples logout sin errores', () => {
      // Act & Assert
      expect(() => {
        service.logout();
        service.logout();
        service.logout();
      }).not.toThrow();
    });

    it('debería manejar llamada a getUser antes de login', () => {
      // Act
      const user = service.getUser();

      // Assert
      expect(user).toBeNull();
    });

    it('debería manejar llamada a getToken antes de login', () => {
      // Act
      const token = service.getToken();

      // Assert
      expect(token).toBeNull();
    });

    it('debería generar tokens únicos', async () => {
      // Arrange
      const userData = {
        email: 'user1@test.com',
        password: 'pass',
        nombre: 'User',
        apellido: 'One',
        negocioNombre: 'Salon',
        tipoNegocio: 'uñas' as const
      };

      // Act - Create first, wait, then create second
      const result1 = await service.register(userData).toPromise();
      await new Promise(resolve => setTimeout(resolve, 10));
      service.logout();
      
      // Modificar la data para segundo registro
      userData.email = 'user2@test.com';
      const result2 = await service.register(userData).toPromise();

      // Assert - With delay, tokens should be unique
      expect(result1!.token).not.toBe(result2!.token);
    });
  });
});
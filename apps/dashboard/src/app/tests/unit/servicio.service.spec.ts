// ============================================
// Unit Tests - ServicioService
// ============================================
// Tests for service (servicio) management functionality
// Spanish comments for clarity

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ServicioService } from '../../services/servicio.service';
import { CreateServicioDTO } from '../../models/servicio.model';

describe('ServicioService - Unit Tests', () => {
  let service: ServicioService;

  // Setup before each test
  beforeEach(() => {
    service = new ServicioService();
  });

  // ============================================
  // TEST: Get all services
  // ============================================

  describe('getAll()', () => {
    it('debería retornar lista de servicios mock', async () => {
      // Act
      const servicios = await service.getAll().toPromise();

      // Assert
      expect(servicios).toBeDefined();
      expect(servicios!.length).toBeGreaterThan(0);
      expect(servicios![0]).toHaveProperty('nombre');
      expect(servicios![0]).toHaveProperty('categoria');
      expect(servicios![0]).toHaveProperty('precio');
    });

    it('debería cargar servicios en el signal items', async () => {
      // Act
      await service.getAll().toPromise();

      // Assert
      expect(service.items().length).toBeGreaterThan(0);
    });

    it('debería incluir servicios de diferentes categorías', async () => {
      // Act
      const servicios = await service.getAll().toPromise();

      // Assert
      const categorias = servicios!.map(s => s.categoria);
      expect(categorias).toContain('Uñas');
      expect(categorias).toContain('Pestañas');
      expect(categorias).toContain('Cejas');
    });
  });

  // ============================================
  // TEST: Get service by ID
  // ============================================

  describe('getById()', () => {
    beforeEach(async () => {
      await service.getAll().toPromise();
    });

    it('debería retornar servicio existente', async () => {
      // Act
      const servicio = await service.getById('servicio-001').toPromise();

      // Assert
      expect(servicio).toBeDefined();
      expect(servicio!.id).toBe('servicio-001');
      expect(servicio!.nombre).toBe('Manicura Básica');
    });

    it('debería retornar undefined para servicio inexistente', async () => {
      // Act
      const servicio = await service.getById('servicio-inexistente').toPromise();

      // Assert
      expect(servicio).toBeUndefined();
    });
  });

  // ============================================
  // TEST: Create service
  // ============================================

  describe('create()', () => {
    it('debería crear nuevo servicio correctamente', async () => {
      // Arrange
      const nuevoServicio: CreateServicioDTO = {
        nombre: 'Tratamiento Facial',
        descripcion: 'Limpieza y tratamiento de piel',
        categoria: 'Tratamientos',
        duracionMinutos: 60,
        precio: 5000,
        activo: true
      };

      // Act
      const resultado = await service.create(nuevoServicio).toPromise();

      // Assert
      expect(resultado).toBeDefined();
      expect(resultado!.id).toBeTruthy();
      expect(resultado!.nombre).toBe('Tratamiento Facial');
      expect(resultado!.categoria).toBe('Tratamientos');
      expect(resultado!.precio).toBe(5000);
    });

    it('debería agregar servicio a la lista interna', async () => {
      // Arrange
      const nuevoServicio: CreateServicioDTO = {
        nombre: 'Nuevo Servicio',
        categoria: 'Otro',
        duracionMinutos: 30,
        precio: 2000,
        activo: true
      };

      // Act
      await service.create(nuevoServicio).toPromise();

      // Assert
      const servicios = service.items();
      expect(servicios.some(s => s.nombre === 'Nuevo Servicio')).toBe(true);
    });

    it('debería generar ID único para cada servicio', async () => {
      // Arrange
      const servicio1: CreateServicioDTO = {
        nombre: 'Servicio 1', categoria: 'Otro', duracionMinutos: 30, precio: 1000, activo: true
      };

      // Act - Create first, wait, then create second
      const resultado1 = await service.create(servicio1).toPromise();
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const servicio2: CreateServicioDTO = {
        nombre: 'Servicio 2', categoria: 'Otro', duracionMinutos: 45, precio: 1500, activo: true
      };
      const resultado2 = await service.create(servicio2).toPromise();

      // Assert - With delay, IDs should be different
      expect(resultado1!.id).not.toBe(resultado2!.id);
    });

    it('debería permitir servicio sin descripción (opcional)', async () => {
      // Arrange
      const servicioSinDesc: CreateServicioDTO = {
        nombre: 'Servicio Simple',
        categoria: 'Otro',
        duracionMinutos: 30,
        precio: 1000,
        activo: true
      };

      // Act
      const resultado = await service.create(servicioSinDesc).toPromise();

      // Assert
      expect(resultado!.descripcion).toBeUndefined();
    });
  });

  // ============================================
  // TEST: Update service
  // ============================================

  describe('update()', () => {
    beforeEach(async () => {
      await service.getAll().toPromise();
    });

    it('debería actualizar servicio existente', async () => {
      // Act
      const resultado = await service.update('servicio-001', { 
        nombre: 'Manicura Premium' 
      }).toPromise();

      // Assert
      expect(resultado!.nombre).toBe('Manicura Premium');
      expect(resultado!.categoria).toBe('Uñas'); // Mantiene valor original
    });

    it('debería actualizar múltiples campos', async () => {
      // Act
      const resultado = await service.update('servicio-001', {
        nombre: 'Manicura Modificada',
        precio: 4000,
        duracionMinutos: 45
      }).toPromise();

      // Assert
      expect(resultado!.nombre).toBe('Manicura Modificada');
      expect(resultado!.precio).toBe(4000);
      expect(resultado!.duracionMinutos).toBe(45);
    });

    it('debería lanzar error para servicio inexistente', async () => {
      // Arrange - load data first
      await service.getAll().toPromise();

      // Act & Assert - The service throws synchronously
      expect(() => {
        service.update('servicio-inexistente', { nombre: 'Test' });
      }).toThrow('Servicio no encontrado');
    });

    it('debería poder desactivar servicio', async () => {
      // Act
      const resultado = await service.update('servicio-001', { 
        activo: false 
      }).toPromise();

      // Assert
      expect(resultado!.activo).toBe(false);
    });
  });

  // ============================================
  // TEST: Delete service
  // ============================================

  describe('delete()', () => {
    beforeEach(async () => {
      await service.getAll().toPromise();
    });

    it('debería eliminar servicio correctamente', async () => {
      // Arrange
      const initialCount = service.items().length;

      // Act
      await service.delete('servicio-001').toPromise();

      // Assert
      expect(service.items().length).toBe(initialCount - 1);
      expect(service.items().some(s => s.id === 'servicio-001')).toBe(false);
    });

    it('debería retornar true después de eliminar', async () => {
      // Act
      const resultado = await service.delete('servicio-001').toPromise();

      // Assert
      expect(resultado).toBe(true);
    });
  });

  // ============================================
  // TEST: Filter by category
  // ============================================

  describe('getByCategoria()', () => {
    beforeEach(async () => {
      await service.getAll().toPromise();
    });

    it('debería filtrar servicios por categoría', async () => {
      // Act
      const servicios = await service.getByCategoria('Uñas').toPromise();

      // Assert
      expect(servicios).toBeDefined();
      expect(servicios!.every(s => s.categoria === 'Uñas')).toBe(true);
      expect(servicios!.length).toBeGreaterThan(1);
    });

    it('debería excluir servicios inactivos', async () => {
      // Arrange - desactivar un servicio
      await service.update('servicio-001', { activo: false }).toPromise();

      // Act
      const servicios = await service.getByCategoria('Uñas').toPromise();

      // Assert
      expect(servicios!.every(s => s.activo)).toBe(true);
      expect(servicios!.some(s => s.id === 'servicio-001')).toBe(false);
    });

    it('debería retornar array vacío para categoría sin servicios', async () => {
      // Act
      const servicios = await service.getByCategoria('CategoríaInexistente').toPromise();

      // Assert
      expect(servicios!.length).toBe(0);
    });
  });

  // ============================================
  // TEST: Get active services
  // ============================================

  describe('getActivos()', () => {
    beforeEach(async () => {
      await service.getAll().toPromise();
    });

    it('debería retornar solo servicios activos', async () => {
      // Act
      const servicios = await service.getActivos().toPromise();

      // Assert
      expect(servicios).toBeDefined();
      expect(servicios!.every(s => s.activo)).toBe(true);
    });

    it('debería retornar todos los servicios si todos están activos', async () => {
      // Act
      const servicios = await service.getActivos().toPromise();

      // Assert - mock services son todos activos
      expect(servicios!.length).toBe(service.items().length);
    });
  });

  // ============================================
  // TEST: Get categories
  // ============================================

  describe('getCategorias()', () => {
    beforeEach(async () => {
      await service.getAll().toPromise();
    });

    it('debería retornar lista de categorías únicas', async () => {
      // Act
      const categorias = service.getCategorias();

      // Assert
      expect(categorias).toBeDefined();
      expect(categorias.length).toBeGreaterThan(0);
      expect(new Set(categorias).size).toBe(categorias.length); // Sin duplicados
    });

    it('debería incluir categorías existentes', async () => {
      // Act
      const categorias = service.getCategorias();

      // Assert
      expect(categorias).toContain('Uñas');
      expect(categorias).toContain('Pestañas');
    });

    it('debería excluir categorías duplicadas', async () => {
      // Arrange - agregar servicios de categorías existentes
      await service.create({
        nombre: 'Test Uñas 2',
        categoria: 'Uñas',
        duracionMinutos: 30,
        precio: 1000,
        activo: true
      }).toPromise();

      // Act
      const categorias = service.getCategorias();

      // Assert - solo una categoría Uñas
      const uñasCount = categorias.filter(c => c === 'Uñas').length;
      expect(uñasCount).toBe(1);
    });
  });

  // ============================================
  // TEST: Provider switching
  // ============================================

  describe('Provider switching', () => {
    it('debería usar provider mock por defecto', async () => {
      // Act
      const servicios = await service.getAll().toPromise();

      // Assert
      expect(servicios!.length).toBeGreaterThan(0);
    });

    it('debería cambiar a provider supabase', () => {
      // Act
      service.setProvider('supabase');

      // Act - debería retornar array vacío
      service.getAll().subscribe({
        next: (servicios) => {
          expect(servicios.length).toBe(0);
        }
      });
    });
  });

  // ============================================
  // TEST: Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('debería mantener precio original si no se especifica', async () => {
      // Arrange
      await service.getAll().toPromise();
      const servicioOriginal = service.items()[0];
      const precioOriginal = servicioOriginal.precio;

      // Act
      await service.update(servicioOriginal.id, { nombre: 'Nuevo Nombre' }).toPromise();
      const servicioActualizado = service.items().find(s => s.id === servicioOriginal.id);

      // Assert
      expect(servicioActualizado!.precio).toBe(precioOriginal);
    });

    it('debería crear servicio con precio 0', async () => {
      // Arrange
      const servicioGratis: CreateServicioDTO = {
        nombre: 'Servicio Gratis',
        categoria: 'Otro',
        duracionMinutos: 15,
        precio: 0,
        activo: true
      };

      // Act
      const resultado = await service.create(servicioGratis).toPromise();

      // Assert
      expect(resultado!.precio).toBe(0);
    });

    it('debería crear servicio con duración máxima (trabajo largo)', async () => {
      // Arrange
      const servicioLargo: CreateServicioDTO = {
        nombre: 'Servicio Largo',
        categoria: 'Otro',
        duracionMinutos: 240, // 4 horas
        precio: 20000,
        activo: true
      };

      // Act
      const resultado = await service.create(servicioLargo).toPromise();

      // Assert
      expect(resultado!.duracionMinutos).toBe(240);
    });

    it('debería poder reactivarse servicio', async () => {
      // Arrange
      await service.getAll().toPromise();
      
      // Desactivar
      await service.update('servicio-001', { activo: false }).toPromise();
      expect(service.items().find(s => s.id === 'servicio-001')!.activo).toBe(false);

      // Reactivar
      const resultado = await service.update('servicio-001', { activo: true }).toPromise();

      // Assert
      expect(resultado!.activo).toBe(true);
    });
  });
});